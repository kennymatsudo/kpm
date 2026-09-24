# Architecture

How KPM's processes, layers, and subsystems fit together. For the rules behind these choices read [`core-principles.md`](core-principles.md); for step-by-step recipes read the subsystem guide linked in each section. Names that appear here are the stable seams; anything finer-grained is best read from the code.

## Processes

KPM is an Electron app with three code zones and one shared package:

```
src/
├── main/       # Electron main process: database, services, providers, IPC handlers
├── preload/    # contextBridge: the only surface the renderer can call (window.api)
├── renderer/   # React UI and Zustand stores
└── shared/     # Process-neutral types, Zod schemas, registries, pure helpers
```

`shared/` is imported by both processes and bundled into the renderer, so it must stay free of Node built-ins and native modules.

### Main process map

| Directory | Owns |
|---|---|
| `db/` | SQLite connection, migrations, repositories, and domain services (plan actions, sync, export, deletion drain). See [`src/main/db/CLAUDE.md`](../src/main/db/CLAUDE.md). |
| `ipc/` | Handler bindings and registration for the endpoint registries in `shared/ipc/`. See [`src/main/ipc/CLAUDE.md`](../src/main/ipc/CLAUDE.md). |
| `services/` | Application services and the composition root (`appServices.ts`). See [`src/main/services/CLAUDE.md`](../src/main/services/CLAUDE.md); board execution lives in `services/agents/` ([guide](../src/main/services/agents/CLAUDE.md)). |
| `chat/` | Chat runtime pieces shared by every provider: prompts, the project write grant, shell write policy, per-Chat model choice. |
| `claude/`, `codex/`, `pi/` | One directory per chat provider: session implementation, auth/binary discovery, model listing. See [`src/main/claude/CLAUDE.md`](../src/main/claude/CLAUDE.md). |
| `kpmTools/` | KPM's own tools (plan, documents, git, trackers), served to every provider from one runtime. |
| `providers/` | Provider readiness and the model catalog fetched at launch. |
| `generation/` | The one-shot generation seam (`runGeneration`). |
| `documents/`, `workBrief/` | The export boundary (`toExternalMarkdown`), markdown codecs, and Work Brief projections for trackers. |
| `trackers/`, `tracker-clients/`, `wiki-clients/` | Jira/Linear/Confluence API clients and tracker status reconciliation. |
| `bootstrap/`, `config/`, `security/`, `project-context/` | Window/menu/dock setup, `getConfig()`, navigation safety, the project context file. |

The renderer is organized by feature under `components/` with one store per domain under `stores/`; see [`src/renderer/CLAUDE.md`](../src/renderer/CLAUDE.md) and [`src/renderer/stores/CLAUDE.md`](../src/renderer/stores/CLAUDE.md).

## Request path

```
renderer service -> window.api (preload) -> ipcRenderer.invoke
  -> registry handler (Zod-validated params) -> service or repository -> SQLite
```

Each IPC domain has one registry in `src/shared/ipc/{domain}Endpoints.ts` that owns the channel names and param schemas; `src/main/ipc/handlers/{domain}.ts` binds a typed handler to every entry. Push events from main to renderer are declared in `src/shared/ipc/{domain}Events.ts`. Renderer code reaches `window.api` only through `src/renderer/services/`.

## Layers in the main process

- **Repositories** (`db/repositories/impl/`, interfaces in `db/interfaces/`) are thin, synchronous SQL wrappers, created by the container in `db/container.ts`.
- **Domain services** (`db/domain/`) own multi-table invariants and transactions: applying `PlanAction`s, tracker import/export and sync, staging and draining tracker deletions.
- **Application services** (`services/`) own workflows that cross the database, git, the filesystem, and providers. They return `ServiceResult<T>` instead of throwing, and are wired once in `services/appServices.ts`.
- **Shared polling** runs on one `PollScheduler`; review polling, chat idle cleanup, and interval-triggered actions register tasks with it instead of owning timers.

Handlers validate and delegate to whichever of these has the behavior; they don't hold business logic.

## Data

All plan data lives in one SQLite database (better-sqlite3) in the user data directory. The schema is defined entirely by `db/migrations.ts`; read it, or a fresh database, for the current tables. The central ones:

- `projects`, `repos` (connected repos, including the active worktree override), and `plan_items` with `plan_relations`. Plan items nest through `parent_id`; labels are free-form and map to tracker issue types when exported.
- `chat_sessions` / `chat_messages`, including each Chat's model choice and each assistant turn's actual model.
- `dev_sessions`, the persisted board execution state (`automation_phase`, `worktree_path`, `base_sha`), with `execution_playbooks` and the review tables beside it.
- `outbound_changes` (tracker changes staged for export, including deletions) and `sync_snapshots` (last-synced state for three-way conflict detection).
- `project_write_grants` (P7), `actions` / `action_runs`, and `app_settings`.

Credentials are never stored in SQLite; tracker tokens live in the OS keychain.

### Project folder

Each project also has a KPM-owned folder for working documents. It is not one of the connected code repos.

```
{project_folder}/
├── attachments/   # Copies of uploaded attachments
├── outputs/       # Results written by actions with the write-outputs capability
└── AGENTS.md      # Project context file (a legacy CLAUDE.md is read if present, never created)
```

Plan data never goes into connected repos: no `.kpm/` folders, no committed plan exports (P4).

## Chat

A Chat runs on one provider at a time: Claude (Agent SDK, `claude/streaming/StreamingSession`), Codex (`codex app-server`, `codex/CodexChatSession`), or pi (`pi/PiChatSession`). All implement `IChatSession` (`services/streaming/IChatSession.ts`); Codex and pi share `BaseTurnQueueChatSession`, while Claude steers follow-ups into a running turn itself. `StreamingSessionService` owns session lifecycle, keyed `chat:{projectId}:{chatSessionId}`, and reconnects idle sessions through native provider resume.

Per-provider differences are declared in `src/shared/providerCapabilities.ts` and checked through it, never by comparing provider names at call sites.

**Tools.** KPM's tools are defined once in `kpmTools/` and registered in `kpmTools/runtimeRegistry.ts`, then exposed to each provider through its own adapter (in-process SDK MCP server for Claude, a local MCP server for Codex, a native tool adapter for pi). Tools that change the plan never write to the database: they emit `PlanAction[]`, and `proposedChangeDisposal` in the renderer either queues them for review or applies them, depending on the user's setting (P8).

**Prompts.** `buildSystemPrompt()` / `buildFocusSystemPrompt()` in `chat/prompts/` compose one registry of sections for every provider.

**Write consent (P7).** `chat/writeGrants.ts` owns the per-project write grant, persisted in `project_write_grants` and read synchronously from memory on the hot path. Each provider adapter translates the decision into its native mode: Claude through `canUseTool` and its sandbox, Codex by switching between read-only and workspace-write sandboxes and answering app-server approval requests, pi by gating its write tools. `chat/shellWritePolicy.ts` decides which shell commands count as writes for all three.

**Generations.** Tool-free, one-shot calls (PR descriptions, commit messages, file summaries) go through `runGeneration` in `generation/`, which resolves a purpose and quality tier to a provider and model. Anything that uses tools is a chat or agent turn instead.

**Actions.** Saved prompts with a trigger and a capability grant (`src/shared/actions.ts`). Manual runs can open in a Chat; automatic and headless runs are single agent turns in `services/repo/ActionRunnerService.ts`, with the tool runtime enforcing the grant.

## Board execution

Starting work on a plan item creates a dev session: an isolated git worktree plus an agent (Claude, Codex, pi, or Gemini) driven by the playbook the user chose. `BoardAgentOrchestrator` runs the playbook's steps (implement, optional opposing review, addressing pass) and persists progress in `dev_sessions.automation_phase` so a run survives restarts (P9). Board agents write only inside their worktree and never read the connected repo's active worktree. See [`src/main/services/agents/CLAUDE.md`](../src/main/services/agents/CLAUDE.md).

## Plan references and the export boundary

Markdown anywhere in KPM (descriptions, criteria, chat, documents) can carry `@plan/<uuid>` tokens, parsed by `src/shared/planRefs.ts`.

- **Authoring:** the Monaco editor folds tokens to titles (`renderer/components/ui/planRefMonaco.tsx`); rendered markdown shows `PlanRefChip`.
- **Agent context:** `formatPlanRefSection` (`claude/contextRefs.ts`) expands tokens into prompts; `DevSessionService` prepends a `<plan-refs>` block to board agent launches.
- **Validation:** `PlanActionService` rejects creates and updates that contain unresolved refs.
- **Export:** `toExternalMarkdown` (`documents/exportBoundary.ts`) rewrites tokens into the destination's native syntax. It is called on every outbound path: tracker exports (through the Work Brief projections), Confluence and Linear document publishing (`services/documentSync/`), and GitHub. Its branded `ExternalMarkdown` return type is what those payloads require, so skipping it is a compile error (P6).
