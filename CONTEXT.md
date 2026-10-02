# KPM domain glossary

The ubiquitous language for KPM. Use these terms exactly in code, comments, and design discussion. This file names the domain.

## Generation

A **one-shot generation** is a single, non-conversational AI call with no tools: a prompt in, text out. PR descriptions, commit messages, and file summaries are examples; `GenerationPurpose` (`src/main/generation/types.ts`) is the full list. They are distinct from **chat** (a steered, multi-turn streaming session) and from **board agent execution** (a worktree-scoped agent that writes code).

- The **generation seam** is `runGeneration`. Every generation site calls it with intent, never provider SDK options.
- A **generation provider** is a backend that can serve a generation (`claude`, `codex`).
- A **tier** (`fast` | `deep` | `cheap`) is a quality/cost band the seam resolves to a concrete model.
- A **purpose** names the calling site; it keys usage attribution and per-purpose provider routing.

Tool-using or multi-turn work is **not** a generation even when it feels one-shot: onboarding context investigates repos with read tools (`OnboardingService`, Claude-only), and **actions** run as grounded agent turns (`ActionRunnerService`), not through the generation seam.

## Model selection

The **default model** is the provider+model the user has chosen as the KPM-wide default, persisted in app settings. `resolveDefaultModel` (`src/shared/modelDefault.ts`) is the one resolver that turns those settings into a `{ provider, model }` pair, in both the main process and the renderer.

A **Chat model choice** is the provider+model assigned to one user-visible Chat, such as a main Chat or a focused-document Chat. A new Chat inherits the default model once; later changes belong only to that Chat and never change the default model. The user may change a Chat model choice between turns, and the Chat keeps the same conversation even when the chosen provider cannot switch models within its current session. Each assistant turn retains the actual provider+model that produced it, independent of the Chat's current choice. If a saved choice becomes unavailable, it remains visible and sending is blocked until the user restores it or explicitly chooses another model; KPM never silently replaces it with the default model. Selecting a new choice updates the Chat immediately, but the provider session changes only when the next turn begins. A Chat remembers its last model choice for each provider; the provider's default model is used only the first time that Chat selects that provider.

A **Chat effort** is the reasoning-effort choice assigned to one Chat for a provider. A new Chat inherits the applicable default effort once; later changes belong only to that Chat. Each Chat remembers its last effort for each provider, and the available levels are determined by the active provider and model. When a model does not support the remembered effort, the Chat adopts and displays that model's default effort rather than approximating another level.

A **Default candidate** is a playbook `AgentCandidate` marked `useDefault: true` instead of naming a concrete provider+model. It follows the default model, resolved live at execution time, so a playbook step tracks whatever model the user later switches to. Resolution happens in the one seam every candidate already resolves through (`resolveCandidateChain`); a Default candidate whose provider is unavailable to the board is skipped, falling through to the next candidate in its chain exactly like an unavailable concrete provider.

## Connected repos

A **connected repo** is a git repository attached to a project (the `Repo` type / `repos` table). Chat reads its files freely; direct writes follow the user's own harness permissions. Agents write only in isolated worktrees during board execution.

- A **publishing grant** (code name: `write grant`) lets KPM's own `git_push` and pull request tools act for a whole project. It is requested on the first push or pull request change and covers every chat in the project plus background action runs until the user turns it off. Direct file, shell, and git writes do not use it. The rule is P4.

- The **main checkout** is the repo's canonical clone (`repos.path`), the working tree at the primary checkout.
- The **active worktree** is a linked git worktree the user has switched the connected repo to (`repos.active_worktree_path`, null when none), set via the "Switch worktree" menu.
- The **effective path** is where the connected repo currently resolves on disk: the active worktree if set, otherwise the main checkout. `resolveEffectiveRepoPath` (`src/shared/repoPath.ts`) is the one resolver both processes read it through. Every connected-repo read (chat tools, system prompts, workspace file access, add-dir scoping, branch watching) resolves through it so the switch is honored consistently.

**Branch facts** are the git questions KPM asks a checkout repeatedly, each with exactly one resolver in `src/main/services/repo/branchFacts.ts`: the current branch, the default branch, the base branch to compare against, whether a branch is off limits to an agent, and whether it has an upstream. "No branch" is always `null`.

A **git write** is an invocation that moves a branch ref, locally or on a remote. All of them go through `src/main/services/repo/gitWrites.ts`. Each takes a **write authorization** saying why the caller may move the ref: `projectWriteGrant` (chat, which must hold or request the project's publishing grant) or `boardSession` (the user's own action on a session they started). Reads are not git writes and keep their own paths.

Distinct from a **session worktree** (`dev_sessions.worktree_path`): a throwaway worktree scaffolded per board agent execution for isolated writes. The two never cross. Switching a connected repo's active worktree does not touch session worktrees, and board execution does not read `active_worktree_path`.

## Work Brief and Repository Scope

A Plan Item's **Work Brief** is the revisioned aggregate that defines the work: `title`, optional `description`, optional `intent`, and structured `acceptance_criteria`. Chat replaces the complete aggregate through `revise_work_brief` with an expected revision; semantic changes increment `work_brief_revision` once. Empty criteria are represented as `[]` in the aggregate and persisted as SQL `NULL`. Headings inside `description` are ordinary prose and are never parsed into execution fields.

A Plan Item's **Repository Scope** is separate from its Work Brief. It records which connected repos the item is expected to affect: one optional **primary repo** and any number of **affected repos**. Changing scope does not revise the Work Brief and does not trigger tracker sync. The primary repo is the default when board execution starts; a dev session may still run against a different connected repo without changing the Plan Item's Repository Scope.

An **unassigned** Plan Item has no primary repo. When work spans multiple connected repos but none is clearly primary, affected repos may remain recorded while the primary repo stays unassigned. Removing a connected repo removes its Repository Scope association and never promotes another repo automatically.

A new dev session snapshots both the execution projection in `initial_instructions` and the corresponding Work Brief revision. Resuming a pending/inactive session reuses that immutable instruction snapshot; a supplemental user prompt may constrain the resumed turn but does not replace the captured contract.

## Outbound Change

An **Outbound Change** is one pending tracker mutation staged for push (the `outbound_changes` table). It comes in two shapes, discriminated on `operation`:

- An **Outbound Item Change** (`create` | `update`) is staged against a live plan item. The plan item still owns the external identity, so the snapshot columns are null.
- An **Outbound Deletion** (`delete`) is **detached**: the plan item is already gone, so the row snapshots the external identity to remove (`external_key`, `external_id`, `tracker_type`) and carries no export targets. `isOutboundDeletion` / `isOutboundItemChange` (`src/shared/types.ts`) are how callers narrow.

Staging and draining are two adjacent owners, and nothing else drives a deletion:

- `removePlanItem` (`db/domain/PlanItemRemoval.ts`) **stages**: every item about to disappear gets a deletion queued in the same unit of work as the delete.
- The **deletion drain** (`db/domain/TrackerDeletionDrain.ts`) **describes and drains**: `describeDeletions` attaches each row's current tracker state for review, `drainDeletions` deletes the approved rows and clears them from the queue. A row that fails keeps its place with the error recorded, so the next drain retries it.

A deletion needs no issue type, plan item, parent, or status mapping, so it is deliberately independent of everything the create/update export path resolves, so a failure there cannot take the staged deletions with it.

## Action

An **Action** is a saved prompt plus how it starts and what it may do (`src/shared/actions.ts`, the `actions` table). Its **trigger** is `manual`, `interval`, or `event` (an `ActionTriggerEvent` such as `pr_changed`); manual invocation stays available under every trigger. Its **capability grant** (`ActionCapability`) is the whole of what a run may touch, and delivery follows from it: `report_finding` becomes a notification, `write_outputs` writes to the project folder's `outputs/actions/`, and `propose_*` grants go through the normal review flow. The tool runtime enforces the grant, so a prompt cannot talk its way past it.

An **action run** is one execution, recorded in `action_runs`. Manual runs happen either in a real chat (proposals reach the usual review UI) or headless; automatic runs are always headless and happen only while the app is open (`ActionRunnerService`). An automatic trigger requires at least one output capability, or it would run and leave no trace.

## Terminal session

A **terminal session** is one shell the user runs in the embedded terminal panel. The main process owns it (`TerminalService`, `src/main/services/streaming/TerminalService.ts`): its id, resolved cwd, status (`running` | `exited`), exit code, and **scrollback**. There is exactly one id per session. The view that first opens it supplies the id, and the session record is authoritative for everything else.

A **terminal view** is the xterm.js instance rendered for a session. A view **attaches** to a session by id and holds no session state of its own; **detaching** leaves the session running. A session therefore outlives its view. Reloading the window or remounting the panel replays the scrollback instead of spawning a second shell. Only an explicit **kill** ends a session, and it is the only way a session leaves the list. An exited session stays listed, with its scrollback still readable, until the user closes its tab.

Output reaches a view only while it is attached. A detached session keeps appending to its scrollback, which is what makes the replay gapless: a chunk is either already in the scrollback handed over at attach or emitted afterwards, never both.

Distinct from an **agent PTY** (`CliAgentSession`): a hidden, hook-instrumented CLI agent process in a session worktree, never attached to a view.

## Credentials

Credentials are never stored in SQLite. Tracker credentials (one entry per tracker type) and the optional Anthropic API key live in the OS keychain under the service name `KPM`, through `keytar` (`src/main/tracker-clients/common/credentials/keytar-provider.ts`, `src/main/claude/auth.ts`).

## Project folder

A project's **folder** is KPM's own working space for the project, separate from its connected repos. KPM creates it, by default under `projects/` in the app's user data directory, with the project context file `AGENTS.md` (a legacy `CLAUDE.md` is read if present, never created). `attachments/` holds copies of uploaded attachments, and `outputs/actions/` holds results written by actions with the `write_outputs` capability. Plan data never goes into this folder or into connected repos (P2).
