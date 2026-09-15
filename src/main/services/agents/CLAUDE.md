# Agent Sessions

Board-driven agent execution for plan items. The board starts implementation work inside an isolated worktree and advances the selected playbook until it reaches a terminal state. The fresh-install default playbook is implementation only; heavier playbooks can run opposing review after implementation and send findings back to the implementation agent before the task moves to `In Review`.

This document describes the current board workflow. It does not describe the older explicit Review-tab workflow.

## Current Board UX

The board UI exposes two explicit actions:

- `Play` starts or resumes implementation for a plan item
- `Stop` stops the currently active implementation run

Everything else is automated according to the selected playbook. The fresh-install default runs only the implementation step, captures the work, and moves the task to `In Review`. Review playbooks add:

1. implementation runs
2. review runs once
3. implementation agent assesses and fixes review findings if warranted
4. task moves to `In Review`

The board detail pane exposes:

- tabs: `Activity`, `Changes`, and `Review` — the `Review` tab is conditional and only renders when the session has a linked PR (`session.pr_number != null`)
- no explicit board control to manually run opposing-agent review as part of the normal path — that still runs automatically once after implementation

The `BoardCard` failure indicator fires on a **union** of two signals:
1. `session.automation_phase === 'needs_attention'` — set by `BoardAgentOrchestrator` or the poller's follow-up-failure branch. `session.attention_reason` persists the concrete failure so the board can show a specific label and valid recovery action.
2. `reviewActionableBySessionId[sessionId].hasActionable` — derived from review tasks that need user action: `disposition === 'needs_user_input'`, `internal_state === 'failed'`, `internal_state === 'stale'`, or a task `error` set on an otherwise-open task. Populated by (a) the `review-poll:actionable` broadcast emitted at the end of every `processSession` call in `ReviewPollService`, and (b) local recomputation in the renderer's `setReviewInbox` helper so user actions (ignore/override/post) clear the dot immediately without waiting for the next poll tick. The reconciler deliberately does NOT touch `automation_phase` to avoid stomping on non-review callers that set `needs_attention`.

The older opposing-agent review findings (`agent_review_runs` / `agent_review_findings`) still exist for audit/debugging but are not the primary UI surface in the board flow.

## Architecture

```text
Board card (drag to in_progress / play button)
  ↓ AgentStartModal (repo, base branch, prompt)
  ↓ IPC: agent-session:create-and-start
Main process
  ├── DevSessionService
  │   ├── resume latest inactive/pending session for the plan item when possible
  │   └── otherwise create pending session + worktree metadata
  ├── AgentSessionManager
  │   ├── ClaudeSdkSession   — Claude via Agent SDK
  │   ├── CodexSdkAgentSession — Codex via Codex SDK
  │   ├── PiSdkAgentSession  — pi.dev models via the in-process Pi SDK
  │   └── CliAgentSession    — Gemini / legacy Claude via CLI + hooks
  └── BoardAgentOrchestrator (wired in by appServices.ts)
      ├── implement complete -> capture branch work
      ├── selected playbook may launch review or follow-up steps
      └── terminal state -> move task to In Review or Needs Attention
  ↓ IPC events broadcast to renderer
devSessionsStore
  ├── session rows
  ├── agentStateBySessionId
  ├── activityFeedBySessionId
  ├── latestActivityBySessionId
  ├── completionBySessionId
  ├── commitStateBySessionId
  └── persisted review findings rehydration
  ↓
BoardCard / DetailPane / ChangesTab / ActivityTab / CommitComposer
```

## Session Lifecycle

### 1. Trigger

User drags a card to `in_progress` or clicks `Play`.

The board start flow uses `agent-session:create-and-start`, but it now prefers continuing prior work:

- if the latest session for that plan item and repo is `inactive` or `pending`, KPM starts that existing session again
- otherwise KPM creates a new pending session and starts it

This avoids silently creating a fresh worktree every time the user re-clicks `Play`.

### 2. Start / Resume

`DevSessionService.startAgentSession()` is the board execution entrypoint for SDK-backed sessions.

Key behavior:

- creates the worktree only if the session worktree path does not already exist
- reuses the existing worktree contents if the path is already present
- marks the session `active`
- launches the implementation agent through `AgentSessionManager`

## Main-Process Automation

Automation state is persisted on the `dev_sessions.automation_phase` column, not held only in the renderer.

Current phases:

- `idle`
- `reviewing`
- `addressing_review`
- `fixing_commit_hooks`
- `paused`
- `ready_for_review`
- `needs_attention`

`needs_attention` is an internal lifecycle phase, not a user-facing label. The
board projects `attention_reason` into a specific failure such as commit checks,
automated review, provider availability, or an interrupted run. An intentional
Stop persists as `paused` with `paused_reason = 'stopped'`, so it never appears
as a failure.

The orchestration lives in `src/main/services/agents/BoardAgentOrchestrator.ts` (`createBoardAgentOrchestrator`), wired into `AgentSessionManager` from `appServices.ts`.

`automationPhaseMachine` is the sole writer of the phase, so it is also where board automation announces itself to the notification bell: a transition **into** `ready_for_review`, `needs_attention`, or a user-decision `paused` state emits a `board_agent` event on the `UpdateEventBus` (`BOARD_AGENT_NOTIFY_PHASES`). An intentional Stop does not notify. Mid-flight phases stay silent — the board card already shows them — and a write that only moves the cursor or pass counts is not announced. Do not emit board notifications from `BoardAgentOrchestrator` or `AgentSessionManager`; route the phase change through the machine and the notification follows.

### Playbook cursors

`dev_sessions.current_step_id` must always name a step the session's `playbook_snapshot` can resolve. The phase machine never invents one: every cursor-writing event carries a `stepId` the caller resolved first, through `sessionPlaybook.ts`.

Every injected turn goes through `harnessTurn.ts` (`requestHarnessTurn` for a turn sent to the session's own agent, `requestHarnessReview` for an unscheduled review subagent). It moves the cursor only once the agent accepts the turn, and puts back the interrupted cursor when a review never launches. A session parked at `needs_attention` keeps that phase through an automated injected turn — only the user's own trigger (`ReviewService.triggerReviewAutomation`) clears it — but the cursor moves either way, because a cursor left on the failed step makes the injected turn's completion settle that step and complete the run from a step that never ran. Writing the cursor first is what silently drops a run's remaining steps: the injected step is not in `playbook.steps`, so the live turn's completion resolves that cursor and `advancePlaybook` completes the run.

Some turns the harness injects are not declared by any playbook — an ad-hoc review launched from the board, and a PR-review follow-up. Those are declared once as standalone `PlaybookStep` values (`AD_HOC_REVIEW_STEP`, `PR_REVIEW_FOLLOWUP_STEP` in `src/shared/playbooks.ts`) and resolved by `resolveHarnessStep` / `resolveCursorStep`. They are deliberately **not** members of any playbook's `steps` array: `advancePlaybook` completes the run for a step id it cannot find in the playbook, which is what makes an injected turn end at its terminal instead of restarting the playbook from step one. An ad-hoc review on a playbook that already has a findings-producing review step resolves to that step instead, so it routes to that playbook's address step exactly as the automated path does. `BoardAgentOrchestrator.startPlaybookReviewPass` runs it as a **new pass** of that step — run ids are keyed off the step's pass count, so reusing the count would rebuild the previous round's completed rows and settle the new review on their findings. Spending that pass is also what a findings result is then measured against, so a playbook whose pass limit is already used up re-pauses with `max_passes` instead of addressing.

A main step's turn goes through `mainStepTurn.ts`, which is also where the choice between continuing the loaded agent and starting a new one lives. Eviction makes the restart routine, so a restarted turn re-enters at its own step: `sendAgentFollowUp`'s `restartAs` carries that step's `systemPromptKey` and live phase into `startAgentSession`, instead of the run reopening at step one's role prompt and `idle` (where a crash never reaches `needs_attention`). A step that declares no `systemPromptKey` of its own still falls back to the playbook's first main step.

### Implementation completion

When the implementation session completes:

- KPM captures the work onto the task branch with a commit
- if the selected playbook has no next step, KPM marks it `ready_for_review` and moves the plan item to `In Review`
- if the next step is a review step, KPM marks it `reviewing` and launches the configured subagent review
- if the session was already in `addressing_review`, completion advances from that playbook step rather than restarting the review path
- if the branch-capture commit fails because hooks report issues, KPM sends one follow-up to the implementation agent with the raw hook output, using `fixing_commit_hooks` plus the persisted playbook cursor to remember where the lifecycle should resume

### Review completion

When a findings-producing review session completes:

- if there are no findings, KPM moves the task to `In Review`
- if findings exist, KPM marks the implementation session `addressing_review` and sends one aggregated follow-up back to the implementation agent

The built-in `Implement + review` playbook runs one review pass and one address pass. The deeper built-in code-review playbook can run more review/address rounds, bounded by its configured pass limit.

Commit-hook repair is also bounded to one automated pass. If the commit still
fails after the repair turn, the session moves to `needs_attention`.

### Race condition guard

If the user sends a follow-up to the implementation agent while the review is still running, the impl session will be in `working` state when the review completes. `BoardAgentOrchestrator`'s `onSessionComplete` detects this and skips the automated follow-up — the impl session is already making progress. Since the phase is `addressing_review`, when the impl agent completes again it will move the task to `In Review` as normal.

### Failure / stop behavior

If implementation or review stops/fails during automation:

- implementation sessions are marked `inactive` on terminal states
- an intentional stop moves to `paused` with reason `stopped`
- a failure moves to `needs_attention` with a persisted `attention_reason`
- the item does not silently continue as though automation succeeded

This is important for `Stop`: the board should no longer leave an SDK-backed implementation session looking active after it has been stopped.

## Review Model

The board workflow still uses opposing-agent review, but it is largely internal:

| Implementation agent | Reviewer |
|----------------------|----------|
| `claude` | `codex` |
| `codex` | `claude` |
| `gemini` | `claude` |
| `pi` | `claude` |

`launchAutoReview` substitutes providers (an unavailable or unauthenticated opponent falls back to Claude) while `launchPlaybookSubagent` refuses one and fails the step — deliberately: the opposing reviewer is a harness heuristic whose only promise is that someone independent reads the diff, whereas a playbook step names the reviewer the user configured, and a playbook expresses its own fallbacks through its candidate chain.

Review results are persisted in `agent_review_runs` / `agent_review_findings`, keyed to the implementation session (not only the `-review` session id). Used for restart-safe audit and stale review detection; not the primary board interaction model.

### Review diff

`launchAutoReview` now accepts an optional `baseBranch` parameter. When provided, it diffs `${baseBranch}..HEAD` to capture both committed and uncommitted changes. Without a base branch it falls back to `git diff HEAD` (uncommitted only). `BoardAgentOrchestrator` passes `session.base_branch` automatically for all automated review launches.

## Completion Detection

Each board turn is a discrete single-shot `query()`. Completion is the SDK async iterator ending (after the final `result`): `ClaudeSdkSession.runTurn` calls `handleCompletion()` when its `for await` loop exits. There is no debounce, no `idle`-vs-`result` arbitration, and no subagent task-counting gate — so an unbalanced subagent `task_started` can no longer pin a session in `working` (the prior failure mode). The `result` message only records usage + `terminal_reason`; `task_*` and `session_state_changed` messages only emit activities / capture the resume id. `CodexSdkAgentSession` uses the same turn-end model (`turn.completed`).

Follow-up turns (`followUp`) start a new `query()` with `options.resume = sdkSessionId` and the full stored `sdkOptions`. **The SDK applies these options' `systemPrompt` on resume, not the persisted one** — always pass the complete options. If there is no resumable `sdkSessionId`, `followUp` rejects and `DevSessionService.sendAgentFollowUp` falls back to a full restart-with-context.

The chat path (`src/main/claude/streaming/StreamingSession.ts`) intentionally keeps streaming-input mode for mid-turn steering — do not converge it onto this model.

## Stop / Resume Semantics

Expected behavior:

- `Stop` terminates the live implementation run and the session becomes `inactive`
- clicking `Play` again on the same task should prefer resuming/continuing the most recent session for that plan item and repo
- a brand new worktree should only appear when KPM is truly starting fresh, not on a normal stop-then-play cycle

If a session was destroyed rather than stopped, the old worktree is gone and KPM will create a new one.

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/agent-types.ts` | shared types + `toReviewSessionId` / `toImplSessionId` helpers |
| `src/main/services/agents/AgentSessionManager.ts` | session registry, event wiring, review persistence, 30 min TTL eviction |
| `src/main/services/agents/PiSdkAgentSession.ts` | Pi SDK board adapter, model selection, worktree tools, usage, and activity mapping |
| `src/main/services/agents/autoReview.ts` | one-shot opposing review launch; accepts `baseBranch` and the `stepId` its completion resolves back to |
| `src/main/services/agents/mainStepTurn.ts` | one turn of a main playbook step: directive, that step's role prompt, and follow-up vs restart at the same cursor and phase |
| `src/main/services/agents/harnessTurn.ts` | injected turns the playbook never declared: cursor discipline, deferral, and the one failure reason they land on |
| `src/main/services/agents/sessionPlaybook.ts` | session snapshot → `Playbook`, and persisted cursor → step (`resolveCursorStep`, `resolveHarnessStep`) |
| `src/main/services/agents/reviewOutputContract.ts` | `REVIEW_FINDINGS_SCHEMA`, `parseReviewFindings`, `deriveReviewOutcome` — the shared review-output contract every adapter's `getResult()` parses through |
| `src/main/services/agents/BoardAgentOrchestrator.ts` | automation state machine: implement → review → address → ready |
| `src/main/services/repo/DevSessionService.ts` | session lifecycle; composes `devSessionPrompt.ts` (`buildAgentContext`, `buildBoardStartInstructions`), `worktreeScaffold.ts`, `devSessionGitInspection.ts` |
| `src/main/services/repo/devSessionPrompt.ts` | `buildAgentContext` (renders Intent / Acceptance Criteria / Context prompt), `buildBoardStartInstructions`, board model/effort/SDK-settings resolution — re-exported from `DevSessionService.ts` |
| `src/renderer/stores/devSessions/` | sliced renderer store: lifecycleSlice, prSlice, reviewSlice, background commit state, persisted review rehydration |

## Review Session ID

The review session ID is always `toReviewSessionId(implSessionId)` from `shared/agent-types.ts`. **Do not** inline the string derivation (`` `${id}-review` ``) anywhere. Use the helper; its inverse is `toImplSessionId`.

## Session Registry Lifetime

`AgentSessionManager` keeps sessions in its registry for **30 minutes** after they reach a terminal state (`complete/failed/stopped`), then evicts them automatically. This window covers follow-up requests. Do not rely on `getByDevSession` returning a session beyond that window — `sendAgentFollowUp` falls back to a full restart when the session is gone.

## Completion Stats

`ClaudeSdkSession`, `CodexSdkAgentSession`, and `CliAgentSession` compute `AgentCompletionSummary` from `git diff --stat HEAD` at completion time. The stats reflect uncommitted changes only; committed-only sessions will report zeros.

## Agent Prompt Shape

`buildAgentContext` (`src/main/services/repo/devSessionPrompt.ts`, re-exported from `DevSessionService.ts`) consumes `workBriefFromPlanItem` and the central execution projection. It renders task facts only: title, optional `## Intent`, structured `## Acceptance Criteria`, optional `## Context`, tracker key, children, parent, and code refs. It does not parse headings from context: a `## Acceptance Criteria` heading inside context remains ordinary context and cannot become the execution contract.

A new session stores its execution context in `initial_instructions` and captures the matching Work Brief revision. Play on an existing pending/inactive same-repo session keeps the worktree and prior supplemental instructions, but refreshes the approved Work Brief before resuming. Follow-up turns do the same. If the Work Brief changes during an implementation turn, the orchestrator queues one reconciliation turn before advancing the playbook to review or completion. Pending proposals are not authoritative until the configured approval or auto-apply path applies them.

`DevSessionService.buildPlanRefSection` additionally prepends a `<plan-refs>` block via `formatPlanRefSection` (`src/main/claude/contextRefs.ts`) so any `@plan/<uuid>` tokens referenced by the item resolve to full plan-item context without the agent needing to call a tool.

The user message is assembled in this order:

1. project-level context file, when present and not still the placeholder
2. explicitly attached context files
3. expanded `<plan-refs>` for any referenced plan items
4. captured Work Brief execution context
5. playbook directive for the current step
6. harness-owned execution policy

The role prompt selected by `systemPromptKey` owns behavior such as implementation, test-first implementation, or review. Claude and Pi receive it through their native system-prompt mechanism. Codex and Gemini adapters prepend it to the initial user message because those board adapters do not expose an equivalent system-prompt option. Implementation roles interpret each KPM field by purpose: acceptance criteria define completion, relevant files provide efficient starting points, and parent items, subtasks, plan refs, project context, and attachments provide constraints without silently expanding scope. File references are hints rather than an authoritative or exhaustive edit list. The default implementation role asks the agent to inspect only the repo instructions and nearby code needed, preserve scope, match local test patterns, and report exact verification. The test-first role is used only by playbooks that select `agents.implementation_tdd_system`; its verification guidance defers to repository instructions and does not require a full suite by default.

The harness appends a non-configurable policy to every write-capable step: the agent leaves changes uncommitted and KPM captures them onto the task branch after the turn. Commit-hook repair uses the same ownership rule.

## Common Pitfalls

- Do not assume board `Play` always means "new worktree". It should usually mean "continue existing work" when prior work exists.
- Do not rely on renderer-only state for orchestration. Use persisted `automation_phase`.
- Do not treat `task_*` or `session_state_changed` messages as session completion. Only the SDK iterator ending (the final `result`) is authoritative — see Completion Detection.
- Do not design the board UX around explicit review-tab interactions unless you intentionally want to reintroduce them.
- Do not reintroduce a blocking commit modal. Commit confirmation is modal; commit execution is backgrounded.
- Do not inline `` `${id}-review` `` — use `toReviewSessionId` / `toImplSessionId` from `shared/agent-types.ts`.
- Do not send an automated review follow-up if the impl session is already active. Check `agentSessionManager.isSessionBusy(implSessionId)` first.
