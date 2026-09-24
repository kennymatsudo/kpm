# Board Agent Execution

The board runs a plan item as an agent session in an isolated git worktree and drives it through the session's playbook until the run completes, pauses, or needs attention. The user has two controls, `Play` and `Stop`; everything between is automated. A playbook is a small state machine of steps (`src/shared/playbooks.ts`). The fresh-install default (`DEFAULT_PLAYBOOK`) is implement only; the built-ins add one opposing review, or a two-lens review loop.

Read [`../CLAUDE.md`](../CLAUDE.md) for service conventions first.

## How a run flows

1. **Start.** `Play` calls `agent-session:create-and-start`, which runs `DevSessionService.createAndStartFromBoard`. It reuses the plan item's latest session when it is on the same repo and `inactive` or `pending` (same worktree, same playbook snapshot, refreshed Work Brief); otherwise `createPendingSession` makes a new one and snapshots the selected playbook into `dev_sessions.playbook_snapshot`. If the reused session is resumable (live cursor, parked at `paused` or `needs_attention`), it resumes the cursor through `resumePlaybook` instead of starting over.
2. **First turn.** `resolvePlaybookPlan` (`src/shared/playbookRuntime.ts`) resolves each step's candidate chain against `listBoardProviders()` and the user's default model. The first main step runs through `runMainStep` into `startAgentSession`, which scaffolds the worktree, pins `base_sha`, and builds the provider session through `createBoardAgentSession` (`agentLaunch.ts`) and `AgentSessionManager.create`.
3. **Turn ends.** `AgentSessionManager` calls the orchestrator's `onSessionComplete`. For a main step, `BoardAgentOrchestrator` commits the worktree onto the task branch (agents are told never to commit; see Commit capture), reconciles a changed Work Brief, and hands the step to `playbookStepRunner.settle`, which calls the pure `advancePlaybook` and then dispatches the next step, pauses, or completes.
4. **Subagent steps** (reviewers, or a writing helper) launch one session per entry in `runs` through `launchPlaybookSubagent`. Their results collect in a run group (`playbookRoundStore.ts`) and settle once every run has reported.
5. **Completion.** When the playbook completes, the step runner first flushes queued PR review tasks (when the session has a PR); only if none were queued does it move the plan item to `In Review` and the phase to `ready_for_review`.

## Where to change what

| Concern | Owner |
|---|---|
| Playbook shape, validation, built-ins, harness steps | `src/shared/playbooks.ts` |
| Pure cursor transitions, candidate resolution, directive rendering | `src/shared/playbookRuntime.ts` |
| Reacting to turn completion, dispatching steps, fan-out rounds, commit capture | `BoardAgentOrchestrator.ts` (+ `playbookRoundStore.ts`) |
| Settling a step: advance, pause, or finish | `playbookStepRunner.ts` |
| Writing `automation_phase` and cursor fields | `automationPhaseMachine.ts` |
| Reading a session's playbook and cursor | `sessionPlaybook.ts` (`readSessionRun`) |
| One main-step turn, including restart at the same step | `mainStepTurn.ts` |
| Turns the playbook never declared (PR follow-up, hook repair, ad-hoc review) | `harnessTurn.ts` |
| Provider launch options, one path for every board session | `agentLaunch.ts` |
| Provider list, models, capabilities shown to playbooks | `boardProviderRegistry.ts` |
| Review findings JSON schema and parsing | `reviewOutputContract.ts` |
| Session lifecycle, worktree, prompt assembly | `src/main/services/repo/DevSessionService.ts`, `devSessionPrompt.ts` |

## Playbooks

A step is `session: 'main'` (a turn on the implementation agent) or `session: 'subagent'` (a separate session beside it). Its `directive` is a prompt (`promptKey` or inline `text`) or a skill; `{{output:<stepId>}}` inlines an earlier step's final text and `{{findings}}` the current findings. A findings step (`verdict: 'findings'`) routes through `onFindings: { goto, maxPasses, onMaxPasses, onStall }`. `parsePlaybook` enforces the structural rules (for example: only the first main step may set `agents` or `systemPromptKey`, `writes` only on single-run subagent steps, every cycle must pass through a step with `maxPasses`).

- **Snapshots.** A session runs its own copy of the playbook taken at creation. Editing a playbook in Settings never changes a running or resumable session.
- **Candidate chains.** A step lists candidates in order; the first whose provider is available and has a matching model wins (an unmatched model falls back to the provider's default model). A `{ useDefault: true }` candidate follows the user's KPM default model and falls through when that provider is unavailable. The built-in implement steps list `useDefault`, then Claude. A step whose chain resolves to nothing fails with `provider-unavailable:<stepId>`; playbook steps never substitute a provider behind the user's back.
- **Convergence.** Only critical and warning findings buy another round. A suggestion-only round is addressed once, then the loop exits (a harness key in `step_outputs` carries that across restarts), and a suggestion-only round past the pass limit proceeds rather than pausing. When the review step sets `onStall`, an address turn that commits nothing pauses (`stalled`) or proceeds instead of re-reviewing an unchanged diff. A re-review is shown the implementer's previous assessment so it can tell a declined finding from an ignored one. A fan-out round where any run fails ends in `some-runs-failed`: settling on the survivors would pass a round one lens never reviewed.
- **Pauses.** `max_passes` and `stalled` pauses offer `proceed` or `one_more_pass` through `resumePlaybook`.

### Cursor rules

`dev_sessions.current_step_id` must always name a step the snapshot can resolve, and the phase machine never invents one: every cursor-writing event carries a step id the caller resolved first.

- **Read cursors only with `readSessionRun(session)`.** A cursor can name a harness step (`AD_HOC_REVIEW_STEP`, `PR_REVIEW_FOLLOWUP_STEP`) that no playbook lists; `stepById` cannot see those and strands the session. `stepById` is only for ids that came out of `playbook.steps`.
- **Harness steps stay out of `playbook.steps` on purpose.** `advancePlaybook` completes the run when the finished step is not in the playbook, which is what makes an injected turn end instead of restarting at step one.
- **Injected turns go through `harnessTurn.ts`.** `requestHarnessTurn` moves the cursor only after the agent accepts the turn, and defers (sends nothing) when the agent is mid-turn. `requestHarnessReview` moves the cursor first, because the review can finish before launch returns, and restores the snapshot if the launch fails. Writing a cursor for a turn that never ran silently drops the run's remaining steps.
- **A parked `needs_attention` survives automated injected turns**; only the user's own action (`ReviewService.triggerReviewAutomation`, or dismissing) clears it. The cursor still moves.
- **Ask what a step does, not the phase.** `readSessionRun(...).cursor.addressesFindings` tells you whether a step addresses review findings; `addressing_review` is the live phase of every main step.
- **"Run review"** (`DevSessionService.runAdHocReview`) runs the playbook's own findings step as a new pass when it has one (`startPlaybookReviewPass`); run ids are keyed on the pass count, so reusing the count would settle the new review on the previous round's rows. Only a playbook without a findings step falls back to `launchAutoReview`.
- **Restarts re-enter at the same step.** The registry evicts a finished session after `agentSession.terminalSessionTtlMs` (30 minutes), so a follow-up often has to start a fresh agent. `sendAgentFollowUp`'s `restartAs` carries the step's `systemPromptKey` and live phase into `startAgentSession`; without it an address turn would run under the implementation role at `idle`, where a crash never reaches `needs_attention`.

## Automation phase machine

`dev_sessions.automation_phase` is the persisted automation state (P9); never keep it only in renderer state. `createAutomationPhaseMachine(...).transition(sessionId, event)` is its only writer: a synchronous read, decide, write, so no caller can interleave a stale write. The event union and the whole transition table are in `automationPhaseMachine.ts`.

| Phase | Meaning |
|---|---|
| `idle` | No automation in flight. |
| `addressing_review` | A main step is running. Not only review work; see Cursor rules. |
| `reviewing` | A subagent step is running. |
| `fixing_commit_hooks` | The one automated repair turn after the capture commit failed. |
| `paused` | Waiting on the user. `paused_reason`: `gate`, `max_passes`, `stalled`, or `stopped` (the user pressed Stop). |
| `ready_for_review` | Run finished; plan item moved to `In Review`. |
| `needs_attention` | Automation could not continue. `attention_reason` names why, and the board turns it into a specific label and recovery action. |

- **Notifications come from the machine.** A transition into `ready_for_review`, `needs_attention`, or `paused` emits a `board_agent` event on the `UpdateEventBus` (`BOARD_AGENT_NOTIFY_PHASES`), except a `stopped` pause. Do not emit board notifications from the orchestrator or session manager.
- **Unexpected termination** during `reviewing`, `addressing_review`, `paused`, or hook repair becomes `needs_attention` / `agent-terminated`; a user Stop becomes `paused` / `stopped`.

### Recipe: change the machine

1. New event: add it to `AutomationPhaseEvent` and a case to `nextState`. Set `pausedReason` / `attentionReason` explicitly so a stale one does not survive.
2. New attention reason: extend `DevSessionAttentionReason` in `src/shared/types.ts` and give it a label and action in `src/renderer/components/board-view/panelStatus.ts`. The column has no DB constraint.
3. New phase or paused reason: extend the type in `src/shared/types.ts`, then add a migration, because `dev_sessions` has CHECK constraints on `automation_phase` and `paused_reason` (changing one means a table rebuild; see [`src/main/db/CLAUDE.md`](../../db/CLAUDE.md)). Decide membership in `isLiveAutomationPhase` (`shared/types.ts`), the machine's termination guard, and `BOARD_AGENT_NOTIFY_PHASES`, and project it in `panelStatus.ts`.
4. Cover it in `automationPhaseMachine.test.ts`, and in `BoardAgentOrchestrator.test.ts` if the orchestrator emits it.

## Commit capture

Every write-capable turn carries `BOARD_AGENT_WRITE_POLICY`: leave changes uncommitted. After each main turn, and after a writing subagent, `captureWorkOnBranch` commits the worktree onto the task branch; without it the branch stays at its fork point and review and PR flows see nothing. A clean tree is fine. A failed commit (usually hooks) gets one automated repair turn in `fixing_commit_hooks`; a second failure lands in `needs_attention`. Whether the capture committed anything is also the "made progress" signal stall detection uses.

## Providers

Board providers are `claude` (`ClaudeSdkSession`), `codex` (`CodexSdkAgentSession`), `pi` (`PiSdkAgentSession`), and `gemini` (`CliAgentSession`, the Gemini CLI in a hidden PTY). All extend `BaseAgentSession`. `CliAgentSession` also carries a Claude CLI path wired to `hookServer.ts`, but board launch never reaches it: `AgentSessionManager.create` always sends Claude to the SDK.

- **Completion** is the provider's own turn-end: Claude's `query()` iterator ending, Codex's `turn.completed`. Never treat `task_*` or `session_state_changed` messages as completion.
- **Follow-ups resume the provider session.** Claude passes `resume: sdkSessionId` with the full stored options, because the SDK applies the options' `systemPrompt` on resume, not the persisted one. With nothing resumable, `DevSessionService.sendAgentFollowUp` restarts with context.
- **Role prompts** (`systemPromptKey`, registered in `src/main/chat/prompts/promptRegistry.ts`, user-overridable through `PromptOverrideService`) go through the native system prompt for Claude and pi, and are prepended to the task prompt for Codex and Gemini (`buildBoardProviderPrompt`).
- **Repo instructions** are read from the worktree natively: Claude through `settingSources: ['user', 'project']` (which also loads the repo's committed `.claude/settings.json` hooks and permissions), pi through its context files, Codex on its own.
- **Safety.** Board Claude runs in `bypassPermissions`, which skips `canUseTool`, so the credential guard is a `PreToolUse` hook (`credentialGuardHook.ts`). Subagent steps without `writes` launch read-only. Claude board sessions disallow `AskUserQuestion` and workflow tools because board turns are one-shot.
- **Findings** are parsed from `finalOutput()`, the full final text, through `reviewOutputContract.ts`. Activity content is capped at 4000 characters, so never parse results from activities.
- **Report blocks.** `runMainStep` appends two harness formats no playbook prompt can remove: `finding-replies` when the turn is given findings, `criteria-status` when the task has Acceptance Criteria. `recordReportedOutcome` in the orchestrator parses them (`src/shared/agentReportBlocks.ts`) from the turn's final text. Replies map back through the `__harness_addressed_findings` output key, which lists each numbered finding's saved run and order, and land on `agent_review_findings.disposition`. Criteria status lands in `__harness_criteria_status`. The board's step cards (`board-view/runOutline.ts`) read both. `formatFindings` numbers findings once across axis sections because the replies refer to those numbers.
- **Completion stats** come from `git diff --stat HEAD` before the capture commit, so they show that turn's uncommitted changes.
- **Opposing review** (`getReviewOpponent` in `agentCatalog.ts`: Claude is reviewed by Codex, everything else by Claude) applies only to `launchAutoReview`, the ad-hoc fallback. It substitutes Claude when the opponent is unavailable; playbook steps never do. Its session id is always `toReviewSessionId(implSessionId)` (inverse `toImplSessionId`); never build `` `${id}-review` `` by hand.

### Recipe: add a board provider

1. Add it to `AgentType` (`src/shared/agent-types.ts`) and the `agentType` enum in `src/shared/ipc/agentSessionEndpoints.ts`.
2. Add an `AGENT_CONFIGS` entry and availability check in `agentCatalog.ts`.
3. Write the session class over `BaseAgentSession`: implement `finalOutput()`, finish a turn with `maybeCompleteTurn` / `completeOnce`, support `followUp`, and honour `readOnly`.
4. Add a branch in `AgentSessionManager.create`. Gotcha: the final `else` builds a `CliAgentSession`, so a missing branch silently runs the provider as a PTY agent.
5. In `agentLaunch.ts`, add it to `BOARD_PROVIDERS` and decide which launch fields it reads (`sdkOptions` is Claude-only; `model` and `effort` pass only for Codex and pi; a native `systemPrompt` only for pi). Update `buildBoardProviderPrompt` if it has a native system prompt.
6. Add it to `listBoardProviders` (`boardProviderRegistry.ts`) with its models and capabilities. `nativeSkills` decides whether a skill directive is sent as `/skill` or inlined from the skill body.
7. `agent_review_runs.reviewer_agent` and `agent_review_findings.agent` have CHECK constraints listing `claude`, `codex`, `gemini`. A provider that can run a findings step needs a migration widening them.
8. Test in `boardProviderRegistry.test.ts`, `agentLaunch.test.ts`, and a session test beside the class.

## Prompt assembly

`buildAgentContext` (`devSessionPrompt.ts`) renders the Work Brief execution projection: title, optional `## Intent`, structured `## Acceptance Criteria`, optional `## Context`, tracker key, parent, children, and code refs. It never parses headings out of context, so a `## Acceptance Criteria` heading inside context stays ordinary context. The result is stored in `initial_instructions` with the matching Work Brief revision; resumes and follow-ups refresh it when the approved Work Brief changed, and a change mid-turn queues one reconciliation turn before the playbook advances.

The first turn's task context is built in `createAndStartFromBoard`, in this order: resolved `<plan-refs>` for any `@plan/<uuid>` in the text (`formatPlanRefSection`), the KPM project context file (skipped while it is still the placeholder), attached context files, then the stored instructions. `renderPlaybookDirective` appends the step directive, any resume note, and the harness policy. For a native skill directive the `/skill` line comes first, because Claude only invokes a command deterministically at byte zero.

Subagents read `DevSessionService.buildSubagentTaskContext`: plan refs, the project context file, and the stored instructions, plus the diff against the base branch (capped at 100k characters by `capReviewDiff`, which lists every file the cut hid). Files attached at launch are not stored, so subagents never see them. The built-in review steps also pass `{{output:implement}}` so the implementer's report is checked against the diff rather than trusted.

## Testing

Tests sit beside each module. `BoardAgentOrchestrator.test.ts` runs the real phase machine over an in-memory `AutomationPhaseRepository`, mocks `electron` and `./autoReview`, and fakes the dev session service, which makes it the place for end-to-end playbook scenarios. Pure cursor logic belongs in `src/shared/playbookRuntime.test.ts` and schema rules in `src/shared/playbooks.test.ts`. Gotcha: these in-memory repositories skip SQLite, so they never exercise the table's CHECK constraints; a new phase, reason, or reviewer value also needs a check against the real schema.
