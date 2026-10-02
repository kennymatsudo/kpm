# KPM Agent Guide

KPM is a single-user developer cockpit: planning, chat, and agentic execution against connected repos. Electron + React + TypeScript + Tailwind + Zustand + better-sqlite3 + Claude Agent SDK. Jira/Linear remain the org's source of truth; KPM is the developer's source of truth.

> Read [`docs/core-principles.md`](docs/core-principles.md) before designing a feature. The principles override patterns you see in the code. The invariants below cite them as **(P1)…(P10)** and are the mechanisms that enforce them.

## Where to start

Read the matching guide before you edit in that directory. Codex and pi do not load nested guides on their own.

| Working on… | Read first |
|---|---|
| A new Claude / Codex tool | [`src/main/claude/AGENTS.md`](src/main/claude/AGENTS.md) |
| A new IPC handler | [`src/main/ipc/AGENTS.md`](src/main/ipc/AGENTS.md) |
| A service / business logic | [`src/main/services/AGENTS.md`](src/main/services/AGENTS.md) |
| Board / agent execution | [`src/main/services/agents/AGENTS.md`](src/main/services/agents/AGENTS.md) |
| Schema / migrations | [`src/main/db/AGENTS.md`](src/main/db/AGENTS.md) |
| UI components | [`src/renderer/AGENTS.md`](src/renderer/AGENTS.md) |
| State management | [`src/renderer/stores/AGENTS.md`](src/renderer/stores/AGENTS.md) |
| What features exist | [`docs/features.md`](docs/features.md) |
| Domain vocabulary (Work Brief, publishing grant, Action, Outbound Change…) | [`CONTEXT.md`](CONTEXT.md) |

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

Dev DB path (macOS): `~/Library/Application Support/KPM - Planning Workbench/planner.db`. Only exists after the app has run once; `*.db` in the project root is gitignored. `make db` opens it in sqlite3.

## Invariants

Each is tied to a principle. Breaking one breaks the cockpit's safety guarantees. When a request would break one (live tracker sync, sharing a plan, plan files in a repo), push back rather than build it.

- **The agent proposes, user configures disposal (P4).** Plan-mutating tools emit `PlanAction[]` via the `onPlanActions` callback. KPM either queues them for review or auto-applies them based on the user's global setting. No tool writes to the DB directly. Configuration changes (`CONFIG_KINDS` in `src/shared/configKinds.ts`, today only playbooks) always queue for review; auto-apply never covers them.
- **Plans live in KPM, not in repos (P2).** Plan data lives in SQLite; documents and the project context file live in the project folder. Neither lives as files inside connected repos. No `.kpm/` folders, no committed plan exports.
- **Translate at every export boundary (P8).** Jira, Linear, Confluence, and GitHub payloads must pass through `toExternalMarkdown` in `src/main/documents/exportBoundary.ts`. Tracker write payloads require its branded `ExternalMarkdown` return type, so skipping it is a compile error. `@plan/<uuid>`, `intent`, `acceptance_criteria`, and `source_document_id` are local-only; if stakeholders need intent or criteria, append them to the description payload at export time.
- **Chat writes follow the user's harness (P5).** Claude, Codex, and pi chats run under the user's own permission settings for that harness (Claude Code permission mode, rules, and sandbox; Codex sandbox and approval policy; pi's none). KPM adds no write gate of its own; it only asks per call where those settings ask. Publishing (`git_push`, pull request writes) needs the per-project publishing grant (P4) in `src/main/chat/writeGrants.ts`, persisted in `project_write_grants` and revocable in Settings, Publishing. KPM-controlled file tools keep credential and secret paths denied. Board agent writes stay scoped to isolated worktrees.
- **`src/shared/` stays free of Node built-ins and native modules.** The renderer and sandboxed preload bundle it and cannot load them, so the break shows at runtime, not in `tsc`.
- **Single user (P1).** No seats, no permissions, no shared state, no conflict-resolution UI.
- **Trackers sync on demand (P4).** No live tracker feeds. Inbound changes are reviewed before they touch the plan; outbound changes are drafted for review. Background reads such as PR polling and triggered actions are allowed, but anything they send out still goes through review or the publishing grant.
- **Board automation state is persisted (P7).** Use `dev_sessions.automation_phase`. Never hold it only in renderer state.
- **Migrations are immutable once deployed.** Create a new one; never edit a shipped migration. Prefer in-place `ALTER TABLE`; a migration that rebuilds a parent table must set `foreignKeysOff: true`, or dropping the old table cascade-deletes its children. See [`src/main/db/AGENTS.md`](src/main/db/AGENTS.md).
- **No `ANTHROPIC_API_KEY` required.** The Claude Agent SDK uses the user's Claude Code session. Don't debug SDK problems as auth problems.

## Code conventions

- **Handlers delegate to a module with behaviour.** IPC handlers validate with Zod and delegate, to a domain/application service for business logic or directly to a repository for plain reads and simple writes. Do not create a pass-through service whose methods just forward to another service or repository with a try/catch wrapper; call the underlying module directly instead.
- **Return `ServiceResult<T>`** from services; do not throw. See `src/main/services/result.ts`.
- **Cross-store side effects use typed events.** The rule and recipe are in [`src/renderer/stores/AGENTS.md`](src/renderer/stores/AGENTS.md).
- **Extract hooks, not wrapper components.** Use Zustand selectors (`useShallow`) for app state; React Context is reserved for the few narrow, rarely changing providers (theme, modal layer, tooltips).
- **Use `getConfig()`** from `src/main/config/index.ts`, not hardcoded configuration values.
- **Register IPC handlers** under `src/main/ipc/register/` (`workspace.ts`, `development.ts`, or `platform.ts`), not directly in `index.ts`.

## UI rules

- **No emojis in the UI.** Use SVG icons from `src/renderer/components/icons/`.
- **No self-referential UI text.** Labels describe what something *does*, not what it contains or how it works internally. Avoid "auto-injected", "system prompt for X", "used by Y".
- **Claude responses are utilitarian, not chatty.** See `RESPONSE_STYLE` in `src/main/chat/prompts/workspace.ts`.

## Multi-file recipes

When you touch one of these, every file listed must stay in sync.

**Add a plan item field**
1. `src/shared/base-types.ts`: add to `PlanItem`
2. `src/shared/planItemFields.ts`: new `PLAN_ITEM_FIELDS` entry. It derives the IPC Zod schema, the PlanAction Zod schema, `PlanItemRepository`'s INSERT column, its single-field UPDATE fast path, its dynamic UPDATE slow path, and the `PlanItemUpdates` type, so one entry wires the whole update path. A field that must also be settable at create time through the `create_item` PlanAction still needs that action's schema + `executeCreateItem`.
3. `src/main/db/migrations.ts`: new migration

Then conditionally: the **`PlanAction` recipe** below if writable via tool; `buildAgentContext` (`src/main/services/repo/devSessionPrompt.ts`) + the `modify_plan` tool prompt if the field should reach the implementation agent; `components/planning/TaskEditModal.tsx` if user-visible.

**Add a `PlanAction` type**
1. `PLAN_ACTION_REGISTRY` entry in `src/shared/planActionSchema.ts`: this alone derives both `PlanAction` (`shared/types.ts`) and `planActionSchema` (IPC validation)
2. Executor in `ACTION_EXECUTORS` (and `collectItemIdsForPrefetch`, if it touches existing items) in `src/main/db/domain/PlanActionService.ts`

A missing executor is a compile error (`ACTION_EXECUTORS` is typed against every `PlanAction['type']`), not a runtime failure.

**Add a Claude tool**
Follow the recipe in [`src/main/claude/AGENTS.md`](src/main/claude/AGENTS.md). A tool that mutates the plan emits `PlanAction[]` via `onPlanActions` and never writes to the DB (P4).

**Add an IPC handler**
Every invoke domain is on the endpoint registry: add one entry to `src/shared/ipc/{domain}Endpoints.ts` (channel + Zod params schema), one handler to the typed binding in `src/main/ipc/handlers/{domain}.ts`, the preload method if that domain lists its methods by hand in `src/preload/api.ts`, and a wrapper in `src/renderer/services/`. See the recipes in [`src/main/ipc/AGENTS.md`](src/main/ipc/AGENTS.md).

**Touch `@plan/<uuid>` flow**
- Parser: `src/shared/planRefs.ts`
- Export boundary: `src/main/documents/exportBoundary.ts` (`toExternalMarkdown`, called by every external export site; wraps the pure resolver in `planRefResolver.ts`, which a few non-export readers call directly)
- Agent-context expansion: `src/main/claude/contextRefs.ts`
- `PlanActionService` rejects unresolved refs

Never bypass the export-boundary rewrite.

**Change a theme token**
- Edit the value in `src/shared/theme.ts`, the single owner of every palette and of `generateThemeVariables`. Never put theme hex values in `index.css`; its `@theme` block only aliases tokens for Tailwind, so a brand-new token needs an alias there too.
- Theme variables are applied at runtime (`renderer/themeBoot.ts` before mount, `ThemeContext` on change), not generated per theme. A built-in `surface0` change also reaches the launch window background automatically via `main/bootstrap/themeAppearance.ts`.

## Finishing a change

- **Verify.** Run `npm run check`. For UI, run the app with `make dev` and look at it. Tests live in two trees, co-located `src/**/*.test.ts` and repo-root `tests/`; check both before assuming something is untested or unused.
- **Docs.** If you add a product surface, add one line to the index in `docs/features.md`. If you changed a recipe, seam, or invariant, update the subsystem guide in place. Don't record history in these docs; git log already does.

## Git workflow

- Pre-commit hooks run lint + typecheck.
- Never commit `*.db`, `release/`, or `dist/` (gitignored).
- Migrations land in the same PR as the code that depends on them.
