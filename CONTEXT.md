# KPM domain glossary

The ubiquitous language for KPM. Use these terms exactly in code, comments, and design discussion. Architecture vocabulary (module, seam, adapter, depth) lives in the `/codebase-design` skill; this file names the *domain*.

## Generation

A **one-shot generation** is a single, non-conversational AI call: a prompt in, text out. Onboarding context, PR descriptions, commit messages, PR review assessment, custom prompts, and file summaries are generations. They are distinct from **chat** (a steered, multi-turn streaming session) and from **board agent execution** (a worktree-scoped agent that writes code).

- The **generation seam** is `runGeneration` (`src/main/generation/`). Every genuinely one-shot generation site calls it; call sites pass intent — **purpose**, **tier**, prompt — never provider SDK options.
- A **generation provider** is a backend that can serve a generation (`claude`, `codex`). Each has a **generation adapter** behind the seam that translates the neutral request into that provider's SDK call and its result back into a neutral `GenerationResult`.
- A **tier** (`fast` | `deep` | `cheap`) is a quality/cost band; the seam resolves it to a concrete provider model via `getConfig().generation`.
- A **purpose** names the calling site; it keys usage attribution and per-purpose provider routing.

Tool-using or multi-turn work is **not** a generation even when it feels one-shot: scheduled loops run as headless chat turns on the chat/agent path, not the generation seam.

## Model selection

The **default model** is the provider+model the user has chosen as the KPM-wide default, persisted in `app_settings` (`chatProvider` plus the per-provider `chatModel` / `chatCodexModel` / `chatPiProviderModel`). `resolveDefaultModel` (`src/shared/modelDefault.ts`) folds those settings into one `{ provider, model }` pair; both the main process (`getDefaultModel` in `db/appSettingsAccess.ts`) and the renderer (`getDefaultModel` in `services/settingsService.ts`) read it through that one pure resolver.

A **Chat model choice** is the provider+model assigned to one user-visible Chat, including a main Chat or a focused-document Chat. A new Chat inherits the default model once; later changes belong only to that Chat and never change the default model. The user may change a Chat model choice between turns, and the Chat keeps the same conversation even when the chosen provider cannot switch models within its current session. Each assistant turn retains the actual provider+model that produced it, independent of the Chat's current choice. If a saved choice becomes unavailable, it remains visible and sending is blocked until the user restores it or explicitly chooses another model; KPM never silently replaces it with the default model. Selecting a new choice updates the Chat immediately, but the provider session changes only when the next turn begins. A Chat remembers its last model choice for each provider; the provider's default model is used only the first time that Chat selects that provider.

A **Chat effort** is the reasoning-effort choice assigned to one Chat for a provider. A new Chat inherits the applicable default effort once; later changes belong only to that Chat. Each Chat remembers its last effort for each provider, and the available levels are determined by the active provider and model. When a model does not support the remembered effort, the Chat adopts and displays that model's default effort rather than approximating another level.

A **Default candidate** is a playbook `AgentCandidate` marked `useDefault: true` instead of naming a concrete provider+model. It follows the default model, resolved live at execution time — so a playbook step tracks whatever model the user later switches to. Resolution happens in the one seam every candidate already resolves through (`resolveCandidateChain`); a Default candidate that resolves to a provider board execution can't run (e.g. `pi`) is skipped, falling through to the next candidate in its chain exactly like an unavailable concrete provider.

## Connected repos

A **connected repo** is a git repository attached to a project (the `Repo` type / `repos` table). Its files are read-only in chat; agents write only in isolated worktrees during board execution.

- The **main checkout** is the repo's canonical clone (`repos.path`) — the working tree at the primary checkout.
- The **active worktree** is a linked git worktree the user has switched the connected repo to (`repos.active_worktree_path`, null when none), set via the "Switch worktree" menu.
- The **effective path** is where the connected repo currently resolves on disk: the active worktree if set, otherwise the main checkout. `resolveEffectiveRepoPath` (`src/shared/repoPath.ts`) is the one resolver both processes read it through; every connected-repo read — chat tools, system prompts, workspace file access, add-dir scoping, branch watching — resolves through it so the switch is honored consistently.

Distinct from a **session worktree** (`dev_sessions.worktree_path`): a throwaway worktree scaffolded per board agent execution for isolated writes. The two never cross — switching a connected repo's active worktree does not touch session worktrees, and board execution does not read `active_worktree_path`.

## Work Brief and Repository Scope

A Plan Item's **Work Brief** is the revisioned aggregate that defines the work: `title`, optional **context** (persisted in the legacy `description` column), optional `intent`, and structured `acceptance_criteria`. Chat replaces the complete aggregate through `revise_work_brief` with an expected revision; semantic changes increment `work_brief_revision` once. Empty criteria are represented as `[]` in the aggregate and persisted as SQL `NULL`. Context headings are ordinary prose and are never parsed into execution fields.

A Plan Item's **Repository Scope** is separate from its Work Brief. It records which connected repos the item is expected to affect: one optional **primary repo** and any number of **affected repos**. Changing scope does not revise the Work Brief and does not trigger tracker sync. The primary repo is the default when board execution starts; a dev session may still run against a different connected repo without changing the Plan Item's Repository Scope.

An **unassigned** Plan Item has no primary repo. When work spans multiple connected repos but none is clearly primary, affected repos may remain recorded while the primary repo stays unassigned. Removing a connected repo removes its Repository Scope association and never promotes another repo automatically.

A new dev session snapshots both the execution projection in `initial_instructions` and the corresponding Work Brief revision. Resuming a pending/inactive session reuses that immutable instruction snapshot; a supplemental user prompt may constrain the resumed turn but does not replace the captured contract. Legacy sessions have an unknown (`NULL`) Work Brief revision.
