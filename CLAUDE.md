# KPM Agent Guide

KPM is a single-user developer cockpit: planning, chat, and agentic execution against connected repos. Electron + React 19 + TypeScript 5 + Tailwind v4 + Zustand + better-sqlite3 + Claude Agent SDK. Jira/Linear remain the org's source of truth; KPM is the developer's source of truth.

> Read [`docs/core-principles.md`](docs/core-principles.md) before designing a feature. The principles override patterns you see in the code. The invariants below cite them as **(P1)…(P10)**.

## Where to start

| Working on… | Read first |
|---|---|
| A new Claude / Codex tool | [`src/main/claude/CLAUDE.md`](src/main/claude/CLAUDE.md) |
| A new IPC handler | [`src/main/ipc/CLAUDE.md`](src/main/ipc/CLAUDE.md) |
| A service / business logic | [`src/main/services/CLAUDE.md`](src/main/services/CLAUDE.md) |
| Board / agent execution | [`src/main/services/agents/CLAUDE.md`](src/main/services/agents/CLAUDE.md) |
| Schema / migrations | [`src/main/db/CLAUDE.md`](src/main/db/CLAUDE.md) |
| UI components | [`src/renderer/CLAUDE.md`](src/renderer/CLAUDE.md) |
| State management | [`src/renderer/stores/CLAUDE.md`](src/renderer/stores/CLAUDE.md) |
| What features exist | [`docs/features.md`](docs/features.md) |
| Architectural map | [`docs/architecture.md`](docs/architecture.md) |
| Domain vocabulary (Work Brief, write grant, Action, Outbound Change…) | [`CONTEXT.md`](CONTEXT.md) |

## Commands

```bash
make install                                  # Install (rebuilds native modules for Electron)
make dev                                      # Run the app (dev)
npx tsc --noEmit                              # Type check
npm run lint                                  # ESLint
npm test                                      # Unit tests (Vitest)
npm test -- src/main/claude/permissions.test.ts   # Single test file
make test:e2e                                 # E2E tests (packages app first)
make db:reset                                 # Reset DB (loses all data)
```

Dev DB path (macOS): `~/Library/Application Support/KPM - Planning Workbench/planner.db`. Only exists after the app has run once; `*.db` in the project root is gitignored.

## Invariants

Each is tied to a principle. Breaking one breaks the cockpit's safety guarantees.

- **Claude proposes, user configures disposal (P8).** Plan-mutating tools emit `PlanAction[]` via the `onPlanActions` callback. KPM either queues them for review or auto-applies them based on the user's global setting. No tool writes to the DB directly.
- **Plans live in SQLite, not in repos (P4).** Plan data does not live as files inside connected repos. No `.kpm/` folders, no committed plan exports.
- **Translate at every export boundary (P6).** Jira, Linear, Confluence, and GitHub payloads must pass through `toExternalMarkdown` in `src/main/documents/exportBoundary.ts` — its branded `ExternalMarkdown` return type is what tracker write payloads require, so skipping it is a compile error. `@plan/<uuid>`, `intent`, `acceptance_criteria`, and `source_document_id` are local-only.
- **Chat reads freely, writes by consent (P7).** The first direct file, shell, or git write requires the user's write grant for the project. It is asked once, persisted in `project_write_grants`, and covers every chat in that project plus background action runs; the selected provider then uses its native writable mode until the user turns writes off in Settings, Writes. KPM-controlled file tools keep credential and secret paths denied. Board agent writes stay scoped to isolated worktrees. The grant and shared decision live in `src/main/chat/writeGrants.ts`.
- **Single user (P1).** No seats, no permissions, no shared state, no conflict-resolution UI.
- **Sync is on-demand (P10).** No live feeds. Inbound queues for triage; outbound drafts for review.
- **Board automation state is persisted (P9).** Use `dev_sessions.automation_phase`. Never hold it only in renderer state.
- **Migrations are immutable once deployed.** Create a new one; never edit a shipped migration. Prefer in-place `ALTER TABLE`; a migration that rebuilds a parent table must set `foreignKeysOff: true`, or dropping the old table cascade-deletes its children. See [`src/main/db/CLAUDE.md`](src/main/db/CLAUDE.md).
- **No `ANTHROPIC_API_KEY` required.** The Claude Agent SDK uses the user's Claude Code session. Don't debug SDK problems as auth problems.

## Code conventions

- **Handlers delegate to a module with behaviour.** IPC handlers validate with Zod and delegate — to a domain/application service for business logic, or directly to a repository for plain reads and simple writes. Do not create a pass-through service whose methods just forward to another service or repository with a try/catch wrapper; call the underlying module directly instead.
- **Return `ServiceResult<T>`** from services; do not throw. See `src/main/services/result.ts`.
- **Stores communicate via typed events** in `src/renderer/stores/storeEvents.ts` for cross-store side effects. Direct cross-store imports are fine for simple reads (e.g. `proposedChangeDisposal.ts` reads `generalSettingsStore`, `usePlanDomainStore`, and `toastStore`).
- **Extract hooks, not wrapper components.** Use Zustand selectors (`useShallow`) for app state; React Context is reserved for the few narrow, rarely changing providers (theme, modal layer, tooltips).
- **Use `getConfig()`** from `src/main/config/index.ts` — no hardcoded configuration values.
- **Register IPC handlers** under `src/main/ipc/register/` (`workspace.ts`, `development.ts`, or `platform.ts`) — not directly in `index.ts`.

## UI rules

- **No emojis in the UI.** Use SVG icons from `src/renderer/components/icons/`.
- **No self-referential UI text.** Labels describe what something *does*, not what it contains or how it works internally. Avoid "auto-injected", "system prompt for X", "used by Y".
- **Claude responses are utilitarian, not chatty.** See `RESPONSE_STYLE` in `src/main/chat/prompts/workspace.ts`.

## Multi-file recipes

When you touch one of these, every file listed must stay in sync.

**Add a plan item field**
1. `src/shared/base-types.ts` — add to `PlanItem`
2. `src/shared/planItemFields.ts` — new `PLAN_ITEM_FIELDS` entry. Derives the IPC Zod schema, the PlanAction Zod schema, `PlanItemRepository`'s INSERT column, its single-field UPDATE fast path, its dynamic UPDATE slow path, and the `PlanItemUpdates` type — one entry wires the whole update path. A field that must also be settable at create time through the `create_item` PlanAction still needs that action's schema + `executeCreateItem`.
3. `src/main/db/migrations.ts` — new migration

Then conditionally: the **`PlanAction` recipe** below if writable via tool; `buildAgentContext` (`src/main/services/repo/devSessionPrompt.ts`) + the `modify_plan` tool prompt if the field should reach the implementation agent; `components/planning/TaskEditModal.tsx` if user-visible.

**Add a `PlanAction` type**
1. `PLAN_ACTION_REGISTRY` entry in `src/shared/planActionSchema.ts` — this alone derives both `PlanAction` (`shared/types.ts`) and `planActionSchema` (IPC validation)
2. Executor in `ACTION_EXECUTORS` (and `collectItemIdsForPrefetch`, if it touches existing items) in `src/main/db/domain/PlanActionService.ts`

A missing executor is a compile error (`ACTION_EXECUTORS` is typed against every `PlanAction['type']`), not a runtime failure.

**Add a Claude tool**
1. Implement in `src/main/kpmTools/tools/`
2. Register the tool group in `src/main/kpmTools/runtimeRegistry.ts`
3. Document usage in `prompts/toolDocs.ts`
4. Scope where it appears through its group's availability (chat modes) and capability in `runtimeRegistry.ts`, and map any new capability in `src/main/services/core/actionCapabilities.ts` or action runs can never reach it. Do not hide it via `canUseTool` (it passes every KPM tool, and Codex/pi never call it) or SDK `allowedTools` (it hides external MCP tools)
5. If it mutates the plan: emit `PlanAction[]` via `onPlanActions` — do **not** write to the DB.

**Add an IPC handler**
Every invoke domain is on the endpoint registry: add one entry to `src/shared/ipc/{domain}Endpoints.ts` (channel + Zod params schema), one handler to the typed binding in `src/main/ipc/handlers/{domain}.ts`, the preload method if that domain lists its methods by hand in `src/preload/api.ts`, and a wrapper in `src/renderer/services/`. See the recipes in [`src/main/ipc/CLAUDE.md`](src/main/ipc/CLAUDE.md).

**Touch `@plan/<uuid>` flow**
- Parser: `src/shared/planRefs.ts`
- Export boundary: `src/main/documents/exportBoundary.ts` (`toExternalMarkdown`, called by every external export site; wraps the pure resolver in `planRefResolver.ts`, which a few non-export readers call directly)
- Agent-context expansion: `src/main/claude/contextRefs.ts`
- `PlanActionService` rejects unresolved refs

Never bypass the export-boundary rewrite.

**Change a theme token**
- Edit the value in `src/shared/theme.ts`, the single owner of every palette and of `generateThemeVariables`. Never put theme hex values in `index.css`; its `@theme` block only aliases tokens for Tailwind, so a brand-new token needs an alias there too.
- Theme variables are applied at runtime (`renderer/themeBoot.ts` before mount, `ThemeContext` on change), not generated per theme. A built-in `surface0` change also reaches the launch window background automatically via `main/bootstrap/themeAppearance.ts`.

## Building a feature end to end

Most features touch every layer. Work inside out, so each layer compiles against the one below it:

1. **Check the principles.** Read the matching section of `docs/core-principles.md` and the Anti-patterns below. If the feature needs a principle bent, stop and raise it.
2. **Shared contract.** Types, Zod schemas, and registries in `src/shared/` (plan item fields, `PlanAction`s, settings in `settingsRegistry.ts`, provider capabilities). Registries derive downstream types, so one entry often wires several layers.
3. **Schema.** A new migration at the end of `src/main/db/migrations.ts`, then a repository or a domain service if the data has multi-table invariants (`src/main/db/CLAUDE.md`).
4. **Behaviour.** An application service returning `ServiceResult<T>`, wired in `src/main/services/appServices.ts` (`src/main/services/CLAUDE.md`). Chat-facing capability goes in a KPM tool; board-facing behaviour goes through the playbook runtime.
5. **IPC.** A registry entry, handler, preload method if needed, and renderer service wrapper (recipe above).
6. **UI.** A store (decide if it is project-scoped) and components under the owning feature folder (`src/renderer/CLAUDE.md`, `src/renderer/stores/CLAUDE.md`).
7. **Verify.** Co-located unit tests beside the code (`*.test.ts`), plus `tests/` at the repo root. Run `npm run check`. For UI, run the app with `make dev` and look at it.
8. **Docs.** Add or edit the entry in `docs/features.md`, and update the subsystem guide in place if you changed a recipe, seam, or invariant. Don't record history in these docs; git log already does.

## Anti-patterns

Common proposals from outside agents that violate KPM's design — push back, don't build:

- **Live tracker sync / Jira push notifications.** Sync is on-demand (P10).
- **Sharing a plan with a teammate.** Single-user (P1). To share, export to Jira/Linear.
- **Storing plans as files inside the repo.** Plans live in SQLite (P4).
- **Syncing `intent` / `acceptance_criteria` to Jira.** Local-only (P6). Append to the description payload at export time if stakeholders need them.
- **Writing to the DB from a Claude tool to skip the approval/auto-apply flow.** Emit `PlanAction[]` (P8).
- **Letting chat write without consent.** Direct writes are allowed only after the user enables them for the project (P7). Never bypass `projectWriteGrants`.
- **Wrapping plan or chat state in React Context.** Use Zustand selectors.
- **Editing a deployed migration to fix a schema bug.** Add a new migration.

## Git workflow

- Pre-commit hooks run lint + typecheck.
- Never commit `*.db`, `release/`, or `dist/` (gitignored).
- Migrations land in the same PR as the code that depends on them.
