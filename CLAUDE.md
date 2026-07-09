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
- **Chat reads, agents write (P7).** Repos are read-only in chat. Writes are scoped to isolated worktrees during board agent execution.
- **Single user (P1).** No seats, no permissions, no shared state, no conflict-resolution UI.
- **Sync is on-demand (P10).** No live feeds. Inbound queues for triage; outbound drafts for review.
- **Board automation state is persisted (P9).** Use `dev_sessions.automation_phase`. Never hold it only in renderer state.
- **Migrations are immutable once deployed.** Create a new one; never edit a shipped migration. See [`src/main/db/CLAUDE.md`](src/main/db/CLAUDE.md).
- **No `ANTHROPIC_API_KEY` required.** The Claude Agent SDK uses the user's Claude Code session. Don't debug SDK problems as auth problems.

## Code conventions

- **Handlers delegate to a module with behaviour.** IPC handlers validate with Zod and delegate — to a domain/application service for business logic, or directly to a repository for plain reads and simple writes. Do not create a pass-through service whose methods just forward to another service or repository with a try/catch wrapper; call the underlying module directly instead.
- **Return `ServiceResult<T>`** from services; do not throw. See `src/main/services/result.ts`.
- **Stores communicate via typed events** in `src/renderer/stores/storeEvents.ts` for cross-store side effects. Direct cross-store imports exist for simple reads (e.g. `approvalQueueStore` reads `generalSettingsStore`/`fileTreeStore`/`toastStore`) — prefer events for side effects, direct imports are fine for reads.
- **Extract hooks, not wrapper components.** Use Zustand selectors (`useShallow`) over React Context.
- **Use `getConfig()`** from `src/main/config/index.ts` — no hardcoded configuration values.
- **Register IPC handlers** under `src/main/ipc/register/` (`workspace.ts`, `development.ts`, or `platform.ts`) — not directly in `index.ts`.

## UI rules

- **No emojis in the UI.** Use SVG icons from `src/renderer/components/icons/`.
- **No self-referential UI text.** Labels describe what something *does*, not what it contains or how it works internally. Avoid "auto-injected", "system prompt for X", "used by Y".
- **Claude responses are utilitarian, not chatty.** See `RESPONSE_STYLE` in `src/main/claude/prompts/workspace.ts`.

## Multi-file recipes

When you touch one of these, every file listed must stay in sync.

**Add a plan item field**
1. `src/shared/base-types.ts` — add to `PlanItem`
2. `src/shared/planItemFields.ts` — new `PLAN_ITEM_FIELDS` entry. Derives the IPC Zod schema, the PlanAction Zod schema, `PlanItemRepository`'s INSERT column, its single-field UPDATE fast path, its dynamic UPDATE slow path, and the `PlanItemUpdates` type — one entry wires the whole update path. A field that must also be settable at create time through the `create_item` PlanAction still needs that action's schema + `executeCreateItem`.
3. `src/main/db/migrations.ts` — new migration

Then conditionally: the **`PlanAction` recipe** below if writable via tool; `DevSessionService.buildAgentContext` + the `modify_plan` tool prompt if the field should reach the implementation agent; `components/planning/TaskEditModal.tsx` if user-visible.

**Add a `PlanAction` type**
1. `PLAN_ACTION_REGISTRY` entry in `src/shared/planActionSchema.ts` — this alone derives both `PlanAction` (`shared/types.ts`) and `planActionSchema` (IPC validation)
2. Executor in `ACTION_EXECUTORS` (and `collectItemIdsForPrefetch`, if it touches existing items) in `src/main/db/domain/PlanActionService.ts`

A missing executor is a compile error (`ACTION_EXECUTORS` is typed against every `PlanAction['type']`), not a runtime failure.

**Add a Claude tool**
1. Implement in `src/main/kpmTools/tools/`
2. Register the tool group in `src/main/kpmTools/runtimeRegistry.ts`
3. Document usage in `prompts/toolDocs.ts`
4. If it should be hidden in a mode or disabled state, enforce that in `permissions.ts` / `canUseTool`; do not use SDK `allowedTools` because it hides external MCP tools
5. If it mutates the plan: emit `PlanAction[]` via `onPlanActions` — do **not** write to the DB.

**Add an IPC handler**
Every invoke domain is on the endpoint registry: add one entry to `src/shared/ipc/{domain}Endpoints.ts` (channel + Zod params schema) and one handler to the typed binding in `src/main/ipc/handlers/{domain}.ts`. See "Adding a New Domain Registry" in [`src/main/ipc/CLAUDE.md`](src/main/ipc/CLAUDE.md).

**Touch `@plan/<uuid>` flow**
- Parser: `src/shared/planRefs.ts`
- Export boundary: `src/main/documents/exportBoundary.ts` (`toExternalMarkdown`, called by every external export site; wraps the pure resolver in `planRefResolver.ts`, which only the on-disk `shared-doc` form calls directly)
- Agent-context expansion: `src/main/claude/contextRefs.ts`
- `PlanActionService` rejects unresolved refs

Never bypass the export-boundary rewrite.

**Change `PlanCard` layout**
- `constants/planCardStyles.ts` (`CARD_BOX_MODEL`) is the single owner of the box model — change a value here.
- `components/planning/PlanCard.tsx` (DOM) and `utils/planHierarchy.ts` (`calculateCardHeight`, `buildHeightMapFromTree`) both read `CARD_BOX_MODEL` directly, so there is nothing left to hand-sync between them.

Heights are calculated, not measured. Drift causes uneven gaps. See [`src/renderer/CLAUDE.md`](src/renderer/CLAUDE.md).

**Change a theme token**
- `src/shared/theme.ts` is the single owner of theme colors: the `graphiteColors`/`fogColors` palettes, `SEMANTIC_COLOR_DEFAULTS`/`DEPTH_COLOR_DEFAULTS` + their `resolveSemanticColors`/`resolveDepthColors` resolvers, `withDerivedExtendedTokens`, and `generateThemeVariables`. Edit the value here — do **not** add it to `index.css`.
- `index.css` holds no theme hex values: theme CSS variables are written to `document.documentElement` at runtime by `renderer/themeBoot.ts` (synchronously, pre-mount) and re-applied by `ThemeContext`. The `@theme` block only aliases the tokens for Tailwind utilities.
- Changing a built-in `surface0` also changes the launch window background: the renderer reports it via the `theme:report-resolved` IPC, `main/bootstrap/themeAppearance.ts` persists it to a `userData` sidecar, and `windowManager.ts` reads it to set `BrowserWindow.backgroundColor`. No action needed — it flows automatically.

Runtime projection, no per-theme codegen.

## Anti-patterns

Common proposals from outside agents that violate KPM's design — push back, don't build:

- **Live tracker sync / Jira push notifications.** Sync is on-demand (P10).
- **Sharing a plan with a teammate.** Single-user (P1). To share, export to Jira/Linear.
- **Storing plans as files inside the repo.** Plans live in SQLite (P4).
- **Syncing `intent` / `acceptance_criteria` to Jira.** Local-only (P6). Append to the description payload at export time if stakeholders need them.
- **Writing to the DB from a Claude tool to skip the approval/auto-apply flow.** Emit `PlanAction[]` (P8).
- **Letting chat modify repo files.** Chat is read-only; writes happen in board worktrees (P7).
- **Wrapping plan or chat state in React Context.** Use Zustand selectors.
- **Editing a deployed migration to fix a schema bug.** Add a new migration.

## Git workflow

- Pre-commit hooks run lint + typecheck.
- Never commit `*.db`, `release/`, or `dist/` (gitignored).
- Migrations land in the same PR as the code that depends on them.
