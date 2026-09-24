# Services Layer

Application services hold behaviour that does not belong on a repository: validation, side effects, and coordination across repositories or processes. They are plain factory functions with injected dependencies, and they return `ServiceResult<T>` instead of throwing. Board agent execution has its own guide: [`agents/CLAUDE.md`](agents/CLAUDE.md).

## How it fits together

- **Composition root.** `appServices.ts` (`createAppServices(container)`) builds every service with explicit dependencies and returns one object; its return type is `AppServices`. Groups are split into `composition/repoServices.ts` and `composition/generationServices.ts`. Read the file top to bottom to see construction order.
- **Startup.** `main.ts` calls `initializeServices(container)` (`container.ts`) once, then `registerAllIpcHandlers(getMainWindow, services)`, which hands individual services to the registrars in `src/main/ipc/register/`. There is no global getter; nothing outside startup reaches the instance.
- **Repositories for handlers.** `services.container` exposes the repository container, so a handler can call a repository directly for a plain read or a single-entity write.
- **Two service layers.** Multi-table, transaction-bound logic lives in `src/main/db/domain/` (for example `PlanActionService`, `PlanItemRemoval`). `src/main/services/` is the application layer above it.
- **Late-built pieces.** The chat runtime is created after `createAppServices` returns, because it needs the main window (`services.createChatRuntime`). Anything a service needs from chat is handed in later (see `setActivityChatSource`, `appLifecycleService.attachChatRuntime`).

Directories group services by domain (`core/`, `repo/`, `agents/`, `files/`, `streaming/`, `generation/`, `confluence/`, `linearDocuments/`, `documentSync/`, `toollog/`). Read the tree for the current list; each file's header comment says what it owns.

## Rules

- **Return `ServiceResult<T>`** (`result.ts`): `success(data)` / `failure(message)`, `AsyncResult<T>` for async. `wrap` / `wrapAsync` turn a throw into a failure. Gotcha: `wrapAsync(fn, errorMessage)` replaces the thrown message with `errorMessage`, so pass one only when the original detail is worthless to the user.
- **In handlers**, `unwrapOrThrow` (`result.ts`) returns data or throws; `toIpcResponse` (`src/main/ipc/response.ts`) is for void or action handlers.
- **Service or repository.** If a handler needs more than the repository call (validation, side effects, more than one repository), give it a service method. If not, call the repository. Never add a method whose body is `try { return success(repo.x()) } catch { return failure(...) }`, or one that only forwards to another service.
- **No module-level instances.** Every dependency arrives through the factory's deps object. Type deps narrowly (`Pick<PlanService, 'updateItem'>`) so tests can pass small doubles.
- **Configuration comes from `getConfig()`** (`src/main/config/index.ts`), not literals.

## Shared infrastructure

- **`PollScheduler`** (`core/PollScheduler.ts`) is the one timer for recurring background work. Register `{ id, intervalMs, handler }`, then `start(id)`. The handler receives a context with an `AbortSignal` and returns `{ outcome: 'ok' | 'noop' | 'error' }`. The scheduler owns jitter, no-overlap, and capped exponential backoff on `error`, and `AppLifecycleService.shutdown` calls `stopAll()`. Registering a duplicate id throws. Current users: `ReviewPollService`, `ActionRunnerService` (one task per interval-triggered action), and `StreamingSessionService` (chat session cleanup). File watchers and `SearchService`'s watcher-reconcile interval do not use it.
- **`UpdateEventBus`** (`core/UpdateEventBus.ts`) carries typed cross-service events: `pr_changed`, `ticket_changed`, `branch_changed`, `action_finding`, `board_agent`. `ticket_changed` has no producer yet. `NotificationService` maps each kind to a bell notification through `NOTIFY_RULES`, which is keyed over the whole union: a new event kind does not compile until it decides whether and how it notifies. Notifications are not persisted, and identical ones are deduped for 30 seconds.
- **`ClaudeUsageService`** records token and cost usage for every provider call site. A new call site picks a `UsageSource` (same file) rather than writing to `claude_usage_events` itself.
- **`AppLifecycleService`** runs startup (`markActiveAsInactive`, so a session left `active` by a crash reads as inactive) and ordered shutdown. A service that owns timers, watchers, or child processes must add its dispose method to this service's deps.

## Single owners worth knowing

Each of these is the only implementation of its concern. Use it rather than writing a second path.

- `repo/branchFacts.ts`: every "which branch" question (current, default, base, protected, upstream). See "Branch facts" in [`CONTEXT.md`](../../../CONTEXT.md).
- `repo/gitWrites.ts`: every ref-moving git call (`publishBranch`, `deleteRemoteBranch`, `deleteLocalBranch`). Each takes a `WriteAuthorization` (`projectWriteGrant` or `boardSession`) so consent is always stated, never inherited.
- `db/domain/PlanItemRemoval.ts` (`removePlanItem`): the only delete path for plan items, used by `PlanService` and `PlanActionService`, because it stages tracker deletions in the same transaction.
- `streaming/TerminalService.ts`: embedded terminal sessions. `detach` leaves the shell running and buffering; only `kill` ends it, and `kill` fails on an unknown id. Do not treat a missing session as a successful kill.
- `repo/RepoWatcherService.ts`: watches `.git/HEAD`. macOS reports a rewrite as `rename`, not `change`; handle both. Watchers must be released on project switch and quit.
- `repo/ActionRunnerService.ts`: runs actions. Chat-mode actions are refused here on purpose; the renderer sends them into a real chat session so their proposals reach the approval queue (P8).

## Recipe: add a service

1. Create `services/<domain>/FooService.ts` exporting `createFooService(deps: FooServiceDeps)` and `export type FooService = ReturnType<typeof createFooService>`. Methods return `ServiceResult` / `AsyncResult`.
2. Construct it in `appServices.ts` after everything it depends on, and add it to the returned `services` object. For a genuine cycle, pass a late-bound getter the way `createBoardAgentOrchestrator` receives `getDevSessionService: () => devSessionServiceRef`.
3. If it registers pollers, take `pollScheduler` as a dep. If it holds resources, add its dispose call to `AppLifecycleService`.
4. Expose it over IPC per [`src/main/ipc/CLAUDE.md`](../ipc/CLAUDE.md): endpoint in `src/shared/ipc/{domain}Endpoints.ts`, handler in `src/main/ipc/handlers/{domain}.ts`, registrar in `src/main/ipc/register/`.
5. Test it with hand-built deps (see Testing).

## One-shot generation (`src/main/generation/`)

`runGeneration(request)` is the seam for single prompt-in, text-out calls with no tools. Current purposes: `commit_message` (`ipc/handlers/agentSessions.ts`), `pr_description` (`repo/GitHubService.ts`, two calls), and `file_summary` (`files/FileSummaryService.ts`). The call site states intent (purpose, tier, prompt); the seam resolves `(purpose, tier)` to a provider and model through `getConfig().generation`, the provider adapter applies the pinned invariants (for Claude: no tools and no MCP servers, `persistSession: false`, the bundled binary, the `CLAUDE_AGENT_SDK_CLIENT_APP` tag), and the seam records usage. Every purpose defaults to Claude; route one to Codex with `generation.providerByPurpose`. A provider with no registered adapter falls back to Claude.

Tool-using or multi-turn work (onboarding, PR review assessment, actions, chat) is agentic and stays off this seam.

To add a generation call:

1. Add the purpose to `GenerationPurpose` in `generation/types.ts`.
2. Map it in `GENERATION_PURPOSE_TO_USAGE_SOURCE` in `appServices.ts` (a `Record`, so a missing entry is a compile error), adding a `UsageSource` in `core/ClaudeUsageService.ts` if none fits.
3. Call `runGeneration({ purpose, tier, prompt, systemPrompt, timeoutMs, timeoutMessage, projectId })` and read `result.text`. Do not build Claude SDK options or call `runClaudeQuery` yourself.

Gotchas: `runGeneration` returns a plain result, not a `ServiceResult`, and it throws on timeout, so the caller wraps it. Check `result.outcome.status` before trusting `text`. Codex has no system-prompt field; its adapter prepends `systemPrompt` to the prompt.

## Testing

- Tests live in two trees: co-located `src/**/*.test.ts` and repo-root `tests/` (`tests/services/` covers `PlanService`, `DevSessionService`, `TrackerService`, and others). Check both before assuming something is untested or unused.
- Build the service directly with `vi.fn()` doubles for its deps; no container or DI framework is involved. `tests/services/PlanService.test.ts` is a representative example.
- Shared mocks are in `tests/mocks/` (Claude SDK, database, electron API, git) and `tests/factories.ts`. Mock `electron` when the module under test imports it.
- For code that calls `runGeneration`, mock `../../generation` (see `repo/GitHubService.test.ts`). The seam's own tests (`generation/generation.test.ts`) mock `runClaudeQuery` and `@openai/codex-sdk`.
- Run one file with `npm test -- path/to/file.test.ts`.
