# Chat Providers, KPM Tools, and Prompts

Chat runs on one of three providers per session: Claude (Agent SDK), Codex (app-server), or pi. All three share one KPM tool runtime, one prompt module, and one project publishing grant. This guide covers how those pieces fit and how to extend them. Board agents live in [`../services/agents/`](../services/agents/CLAUDE.md) and are out of scope here.

## How it fits together

**Sessions.** `services/streaming/StreamingSessionService.ts` owns live chat sessions, keyed `chat:{projectId}:{chatSessionId}`. `services/streaming/chatSessionLaunch.ts` turns a resolved model choice into a provider session: `claude/streaming/StreamingSession.ts` (fed by `buildSdkOptions` in `sdkOptionsBuilder.ts`), `codex/CodexChatSession.ts`, or `pi/PiChatSession.ts`. All implement `IChatSession`. A session disconnects after `session.mainIdleTimeoutMs` of idle time and resumes on the next message. Scope is `main` (full tool set, shared by the Plan and Workspace views) or `focus_document` (doc focus mode, reduced tools and a slimmer prompt).

**KPM tools.** Tool implementations live in `src/main/kpmTools/tools/`. `kpmTools/runtimeRegistry.ts` groups them (`buildToolGroups`) and is the source of truth for which tools exist; `kpmTools/runtime.ts` filters groups by scope and capability grant and runs each call inside an `AsyncLocalStorage` execution context (project, chat session, proposal sink). Each provider has a thin adapter over the same runtime:

| Provider | Adapter | Tool names the model sees |
|---|---|---|
| Claude | `kpmTools/createKpmServer.ts` (in-process SDK MCP server) | `mcp__kpm__<name>` |
| Codex | `codex/KpmCodexMcpServer.ts` (localhost MCP over HTTP, per-session bearer token) | via the `kpm` MCP server |
| pi | `pi/kpmToolAdapter.ts` (pi `defineTool` shape) | bare `<name>` |

**Proposals.** Tools that change the plan or project files never write. They emit a proposal (`kpmTools/proposals.ts`); `StreamingSessionService.subscribeToToolProposals` forwards it to the renderer, and `renderer/stores/proposedChangeDisposal.ts` either queues it for review or auto-applies it per the user's setting (P8). Focus sessions always force review of document proposals.

**Prompts.** `src/main/chat/prompts/index.ts` exposes `buildChatSystemPrompt(context, { provider, scope })`, which every provider calls. Claude keeps its own templates (`buildSystemPrompt`, `buildFocusSystemPrompt`) because it is the only provider whose built-in tool names the prompt may mention. Codex and pi share one composition plus a `PROMPT_PROFILES` entry (identity line, optional prelude). Editable sections come from `promptRegistry.ts` via `resolveRegistryPrompt`, so user overrides (Settings, Prompts) reach every provider. `contextBuilders.ts` assembles the `PlanContext` the builders read.

**Write permissions (P7).** Every provider follows the user's own harness permissions. Claude loads the user's Claude Code settings (`settingSources: ['user']`, so their allow and deny rules and sandbox apply), and `claude/userPermissionMode.ts` passes their `permissions.defaultMode`, which the SDK otherwise ignores. `canUseTool` (`createPermissionPrompt`) is only called for what those settings ask about, and asks the user per call; a run with no chat is denied. Codex reads the user's own Codex config through `config/read` and sends that approval policy and sandbox on every turn (`codexSandboxPolicy`), adding the project folder and connected repos to the writable roots under workspace-write. Any approval Codex asks for goes to the user per request. pi has no permission system, so `PiChatSession` activates all its built-in tools and adds no gate; a gate the user installs as a pi extension loads into KPM sessions too. `chat/writeGrants.ts` now holds only the per-project publishing grant for KPM's `git_push` and pull request tools.

**Models and capabilities.** `providers/modelCatalog.ts` fetches Claude's and Codex's model lists at launch (`refreshModelCatalog` in `main.ts`), saves the last good copy under userData, and serves reads synchronously; `shared/modelCatalog.ts` holds the parsers, the fallback list, and `formatModelName`. `chat/modelChoice/` resolves which provider, model, and effort a chat uses. `shared/providerCapabilities.ts` declares what each provider can do; the renderer reads it through `getProviderCapabilities`.

## Recipes

### Add a KPM tool

1. Write a `createXTools(deps)` factory in `src/main/kpmTools/tools/` using `tool()` from `tools/index.ts`, a Zod raw shape for input, and `jsonResult` / `toolError` for output. `plan-items.ts` is the read example; `plan-changes.ts` is the proposal example. Wrap the handler in `projectScoped` instead of taking a `projectId` parameter; the project comes from the chat. Mark a tool that changes nothing with `annotations: { readOnlyHint: true }`: Claude Code runs MCP calls in parallel only when that flag is set, and Codex auto-approves them. Keep the description under 2,048 characters (Claude Code cuts longer ones without telling the model, and `runtime.test.ts` fails on them) and put per-parameter detail in `.describe()`, which is not cut. Keep a default result well under Claude Code's 25,000-token cap, and return large text such as git output as plain text rather than JSON-escaped.
2. Add a `group(...)` entry in `buildToolGroups()` in `runtimeRegistry.ts`. Pick availability (`MAIN_ONLY` or `ALL_CHAT_SCOPES`); this is how a tool is hidden from focus mode. Pick capabilities from `KpmToolCapability` in `runtime.ts`, adding one if none fits.
3. If the tool should be reachable from action runs, map its capability in `services/core/actionCapabilities.ts`. That map is keyed by action grant, so a new tool capability left out of it compiles fine and is silently unreachable from actions.
4. If the tool changes plan state, emit `PlanAction[]` through the `emitPlanActions` callback. Never write the DB. For files, reuse the document, context, move, or delete emitters. A new proposal kind needs a variant in `proposals.ts`, a branch in `subscribeToToolProposals`, and an adapter in `proposedChangeDisposal.ts`.
5. If the tool must act directly instead of proposing (as `git_push` does), request the project grant inside the tool through `projectWriteGrants.request`; see `requestGitPushWriteAccess`. No provider gate stops a KPM tool: `canUseTool` auto-allows `mcp__kpm__*`, and Codex and pi do not gate them either.
6. Put routing guidance in `chat/prompts/toolDocs.ts` only if the decision is non-obvious. That tree is in Claude's main prompt only; Codex and pi learn a tool from its description, so the description must stand on its own.
7. Restart the app. Tool definitions are built once in `warmupMcpSdk` and cached.

### Add or change a prompt section

- **User-editable section:** export the default text from `workspace.ts`, add a `SYSTEM_PROMPTS` entry in `promptRegistry.ts`, and call `resolveRegistryPrompt(key, getPromptContent)` in both `buildSystemPrompt` and the shared branch of `buildChatSystemPrompt`. Settings picks up registry entries automatically through `PromptOverrideService`.
- **Fixed section:** add it to the builders directly. If it names Claude tools (Read, Grep, Glob, Bash), keep it out of the shared composition; `crossProviderPromptParity.test.ts` fails if they leak to Codex or pi. Provider-specific tool guidance goes in that provider's `PROMPT_PROFILES` prelude.
- **Per-message context** (current view, focused resources) is injected into the user turn by `StreamingSessionService`, not the system prompt. That keeps the system prompt byte-stable so prompt caching survives view switches.
- Update the golden files in `chat/prompts/__fixtures__/` (`claudeMainBaseline.txt`, `codexFocusBaseline.txt`, `piFocusBaseline.txt`). The tests compare byte for byte, so review the diff as a prompt change.

### Add a provider capability

Add the field with a doc comment to `ProviderCapabilities` in `shared/providerCapabilities.ts` and set it for every provider; `satisfies Record<ChatProvider, ProviderCapabilities>` makes a missing entry a compile error. Read it through `getProviderCapabilities(provider)` instead of branching on the provider name. Add a flag only together with the code that reads it.

### Change the model list

Claude offers only the moving aliases in `CLAUDE_CHAT_MODEL_IDS` (`shared/modelCatalog.ts`), so a new Claude version needs no code change. Codex's list comes live from app-server `model/list`; `CODEX_CHAT_MODELS` in `shared/types.ts` is the fallback and the only source of Codex context windows. Readers never wait on a fetch, so a new consumer should call `getModelCatalog()` and listen for the `chatEvents.modelCatalog` update rather than fetching.

## Invariants and gotchas

- **The prompt channel matters.** Claude gets `systemPrompt: { type: 'custom', prompt, snapshot: false }`. `snapshot: false` is load-bearing: otherwise the SDK records the first request's prompt and replays it on every later request and resume, so plan edits and grant changes never reach the model. Always send the full prompt on resume. Codex gets it as `developer_instructions` in the thread config (`CodexChatSession.threadOptions`), which is re-sent every request and survives compaction; prepending it to the first message would put it in history, which compaction throws away.
- **The global `~/.claude/CLAUDE.md` is folded in by KPM**, not the SDK, since KPM passes a custom prompt rather than the `claude_code` preset. It is gated by the `respectGlobalClaudeMd` setting in `contextBuilders.ts` and reaches all providers through `buildUserGlobalInstructionsSection`. `appSettings` is an optional dependency so non-chat callers do not inherit it.
- **Read the grant live.** Permission handlers are built once per session spawn, so anything they depend on must be looked up per call. `projectWriteGrants.has()` is a synchronous memory read for that reason; never capture the grant as a boolean.
- **KPM's own rules run as a PreToolUse hook.** `createKpmToolHook` captures project file edits and denies MCP servers disabled in KPM settings. It has to be a hook: in `bypassPermissions` the SDK never calls `canUseTool`, but hooks fire in every mode. `tools` is `['default']`, which only expands to the built-in preset as the sole value.
- **Shell reach is the user's sandbox.** KPM sets no sandbox of its own, so a Claude, Codex, or pi shell reaches whatever the user's harness settings allow, credential files included unless the user denies them. KPM's own file tools still check the `services/files/pathSecurity.ts` roots.
- **GitHub writes go through KPM tools.** `git_push` and the GitHub tools (`find_pull_requests`, `read_pull_request`, `create_pull_request`, `update_pull_request`) run `gh` from the main process, so they work even when the user's sandbox cuts the shell off from the network. The PR write tools ask for the project publishing grant themselves, because no provider gates KPM tools. `git_push` goes through `publishBranch` (`services/repo/gitWrites.ts`), which refuses force, refspecs, and protected or default branches. `git_read` runs read-only git via `execFile` and needs no grant.
- **Claude's edits to project files are intercepted, not executed.** `Write`/`Edit` on the project context file or on project files are captured by `permissions.ts` and turned into a review proposal. Repeated edits to one file in a turn accumulate through the pending-content cache in `runtimeRegistry.ts`, which is cleared at the start of each turn.
- **Tool input schemas must convert to JSON Schema.** Codex and pi receive JSON Schema, not Zod. `assertKpmToolInputSchemas` throws at startup if a shape does not convert.
- **Listing and execution are both scope- and grant-checked.** A tool the model names outside its scope or grant is refused at execution, not just hidden. A group with `isEnabled` (Jira, until credentials are stored) is left out the same way.
- **Claude loads KPM tools up front except `DEFERRED_KPM_TOOLS`** (`kpmTools/createKpmServer.ts`), which it finds through tool search. The flag is per tool; never set `alwaysLoad` on the server, which would load the deferred ones too. Defer a tool only when usage shows chat rarely calls it; a new tool loads by default.
- **`@plan/<uuid>` refs** must come from KPM tool results; `PlanActionService` rejects unresolved ones. `contextRefs.ts` (`formatPlanRefSection`) expands them for agent context, and `toExternalMarkdown` rewrites them at export (see the root guide).
- **Work Brief fields** (title, description, intent, acceptance criteria) change through the `revise_work_brief` PlanAction with `expected_revision`; `update_item` cannot touch them. Repository Scope uses `set_repo_targets`. Keep the `modify_plan` description telling the model to fetch the item first, since a revision is a full replacement. Field limits live in `shared/planItemFields.ts`.

## Tests

Tests sit next to their modules. The ones that guard this subsystem's contracts:

- `kpmTools/providerParity.test.ts`: all three adapters route through the runtime and expose the same tool contracts per scope.
- `kpmTools/runtime.test.ts`: scope and capability filtering.
- `claude/permissions.test.ts`: document capture, disabled MCP servers, and the per-call prompt. `chat/writeGrants.test.ts`: the project publishing grant. `services/repo/gitReadOnly.test.ts`: which git commands `git_read` accepts.
- `claude/sdkOptionsBuilder.test.ts`: Claude launch options.
- `chat/prompts/index.test.ts`, `chat/prompts/crossProviderPromptParity.test.ts`: prompt baselines and leak checks.
- `providers/modelCatalog.test.ts`, `shared/modelCatalog.test.ts`, `shared/providerCapabilities.test.ts`.

Run one with `npm test -- <path>`.
