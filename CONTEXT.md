# KPM domain glossary

The ubiquitous language for KPM. Use these terms exactly in code, comments, and design discussion. Architecture vocabulary (module, seam, adapter, depth) lives in the `/codebase-design` skill; this file names the *domain*.

## Generation

A **one-shot generation** is a single, non-conversational AI call: a prompt in, text out. Briefing synthesis, onboarding context, PR descriptions, commit messages, PR review assessment, custom prompts, Slack triage classification, and file summaries are generations. They are distinct from **chat** (a steered, multi-turn streaming session) and from **board agent execution** (a worktree-scoped agent that writes code).

- The **generation seam** is `runGeneration` (`src/main/generation/`). Every genuinely one-shot generation site calls it; call sites pass intent — **purpose**, **tier**, prompt — never provider SDK options.
- A **generation provider** is a backend that can serve a generation (`claude`, `codex`). Each has a **generation adapter** behind the seam that translates the neutral request into that provider's SDK call and its result back into a neutral `GenerationResult`.
- A **tier** (`fast` | `deep` | `cheap`) is a quality/cost band; the seam resolves it to a concrete provider model via `getConfig().generation`.
- A **purpose** names the calling site; it keys usage attribution and per-purpose provider routing.

Tool-using or multi-turn work is **not** a generation even when it feels one-shot: scheduled loops (a headless chat turn) and the Slack tool-reading adapter (a bespoke tool-driven loop) run on the chat/agent path, not the generation seam.

## Model selection

The **default model** is the provider+model the user has chosen in KPM — their chat pick, persisted in `app_settings` (`chatProvider` plus the per-provider `chatModel` / `chatCodexModel` / `chatPiProviderModel`). `resolveDefaultModel` (`src/shared/modelDefault.ts`) folds those settings into one `{ provider, model }` pair; both the main process (`getDefaultModel` in `db/appSettingsAccess.ts`) and the renderer (`getDefaultModel` in `services/settingsService.ts`) read it through that one pure resolver.

A **Default candidate** is a playbook `AgentCandidate` marked `useDefault: true` instead of naming a concrete provider+model. It follows the default model, resolved live at execution time — so a playbook step tracks whatever model the user later switches to. Resolution happens in the one seam every candidate already resolves through (`resolveCandidateChain`); a Default candidate that resolves to a provider board execution can't run (e.g. `pi`) is skipped, falling through to the next candidate in its chain exactly like an unavailable concrete provider.
