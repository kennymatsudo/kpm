# Agent Sessions

Board-driven agent execution for plan items. The board starts implementation work, main-process orchestration runs one opposing review after implementation, the implementation agent may address those findings automatically, and only then does the task move to `In Review`.

This document describes the current board workflow. It does not describe the older explicit Review-tab workflow.

## Current Board UX

The board UI exposes two explicit actions:

- `Play` starts or resumes implementation for a plan item
- `Stop` stops the currently active implementation run

Everything else is automated:

1. implementation runs
2. review runs once
3. implementation agent assesses and fixes review findings if warranted
4. task moves to `In Review`

The board detail pane exposes:

- tabs: `Activity`, `Changes`, and `Review` — the `Review` tab is conditional and only renders when the session has a linked PR (`session.pr_number != null`)
- no explicit board control to manually run opposing-agent review as part of the normal path — that still runs automatically once after implementation

The `BoardCard` orange dot fires on a **union** of two signals:
1. `session.automation_phase === 'needs_attention'` — set by `BoardAgentOrchestrator` or the poller's follow-up-failure branch (legacy semantic: "automation interrupted, click Play").
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
  │   └── CliAgentSession    — Gemini / legacy Claude via CLI + hooks
  └── BoardAgentOrchestrator (wired in by appServices.ts)
      ├── implement complete -> launch one auto-review
      ├── review complete with findings -> send one follow-up to implementation
      └── terminal state -> move task to In Review or Needs Attention
  ↓ IPC events broadcast to renderer
devSessionsStore
  ├── session rows
  ├── agentStateBySessionId
  ├── activitiesBySessionId
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
- `fixing_commit_hooks_after_review`
- `ready_for_review`
- `needs_attention`

The orchestration lives in `src/main/services/agents/BoardAgentOrchestrator.ts` (`createBoardAgentOrchestrator`), wired into `AgentSessionManager` from `appServices.ts`.

### Implementation completion

When the implementation session completes:

- if the session was already in `addressing_review`, KPM marks it `ready_for_review` and moves the plan item to `In Review`
- otherwise KPM marks it `reviewing` and launches one opposing review
- if the branch-capture commit fails because hooks report issues, KPM sends one follow-up to the implementation agent with the raw hook output, using `fixing_commit_hooks` or `fixing_commit_hooks_after_review` to remember where the lifecycle should resume

### Review completion

When the review session completes:

- if there are no findings, KPM moves the task to `In Review`
- if findings exist, KPM marks the implementation session `addressing_review` and sends one aggregated follow-up back to the implementation agent

There is no infinite review/fix loop in the board workflow. The review runs once.

Commit-hook repair is also bounded to one automated pass. If the commit still
fails after the repair turn, the session moves to `needs_attention`.

### Race condition guard

If the user sends a follow-up to the implementation agent while the review is still running, the impl session will be in `working` state when the review completes. `BoardAgentOrchestrator`'s `onSessionComplete` detects this and skips the automated follow-up — the impl session is already making progress. Since the phase is `addressing_review`, when the impl agent completes again it will move the task to `In Review` as normal.

### Failure / stop behavior

If implementation or review stops/fails during automation:

- implementation sessions are marked `inactive` on terminal states
- automation phase may move to `needs_attention`
- the item does not silently continue as though automation succeeded

This is important for `Stop`: the board should no longer leave an SDK-backed implementation session looking active after it has been stopped.

## Review Model

The board workflow still uses opposing-agent review, but it is largely internal:

| Implementation agent | Reviewer |
|----------------------|----------|
| `claude` | `codex` |
| `codex` | `claude` |
| `gemini` | `claude` |

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
| `src/main/services/agents/autoReview.ts` | one-shot opposing review launch + findings parsing; accepts `baseBranch` |
| `src/main/services/agents/BoardAgentOrchestrator.ts` | automation state machine: implement → review → address → ready |
| `src/main/services/repo/DevSessionService.ts` | session lifecycle + `buildAgentContext` (renders Intent / Acceptance Criteria / Context prompt), board launch prompt assembly (`buildBoardStartInstructions`, `buildPlanRefSection`) |
| `src/renderer/stores/devSessions/` | sliced renderer store: lifecycleSlice, prSlice, reviewSlice, background commit state, persisted review rehydration |

## Review Session ID

The review session ID is always `toReviewSessionId(implSessionId)` from `shared/agent-types.ts`. **Do not** inline the string derivation (`` `${id}-review` ``) anywhere. Use the helper; its inverse is `toImplSessionId`.

## Session Registry Lifetime

`AgentSessionManager` keeps sessions in its registry for **30 minutes** after they reach a terminal state (`complete/failed/stopped`), then evicts them automatically. This window covers follow-up requests. Do not rely on `getByDevSession` returning a session beyond that window — `sendAgentFollowUp` falls back to a full restart when the session is gone.

## Completion Stats

`ClaudeSdkSession`, `CodexSdkAgentSession`, and `CliAgentSession` compute `AgentCompletionSummary` from `git diff --stat HEAD` at completion time. The stats reflect uncommitted changes only; committed-only sessions will report zeros.

## Agent Prompt Shape

`buildAgentContext` (`src/main/services/repo/DevSessionService.ts`, takes an `AgentContextInput` with `item`/`project`/`children`/`parent`) chooses prompt sections based on what the plan item carries:

- `## Intent` — rendered when `item.intent` is set.
- `## Acceptance Criteria` — rendered when `item.acceptance_criteria` has entries; each becomes a `- [ ]` checkbox line.
- `## Context` / `## Description` — the description block. Rendered as `## Context` when acceptance criteria are present (description is supplementary rationale), `## Description` otherwise. `No description provided.` is used as a final fallback only when neither intent, criteria, nor description exist.
- `## Instructions` — instructs the agent not to commit. When acceptance criteria are present, the instruction explicitly tells the agent to satisfy every criterion.

When adding new plan-item fields that should flow to the agent, update `buildAgentContext` accordingly.

`DevSessionService.buildPlanRefSection` additionally prepends a `<plan-refs>` block via `formatPlanRefSection` (`src/main/claude/contextRefs.ts`) so any `@plan/<uuid>` tokens referenced by the item resolve to full plan-item context without the agent needing to call a tool.

## Common Pitfalls

- Do not assume board `Play` always means "new worktree". It should usually mean "continue existing work" when prior work exists.
- Do not rely on renderer-only state for orchestration. Use persisted `automation_phase`.
- Do not treat `task_*` or `session_state_changed` messages as session completion. Only the SDK iterator ending (the final `result`) is authoritative — see Completion Detection.
- Do not design the board UX around explicit review-tab interactions unless you intentionally want to reintroduce them.
- Do not reintroduce a blocking commit modal. Commit confirmation is modal; commit execution is backgrounded.
- Do not inline `` `${id}-review` `` — use `toReviewSessionId` / `toImplSessionId` from `shared/agent-types.ts`.
- Do not send an automated review follow-up if the impl session is already active. Check `agentSessionManager.getByDevSession(implSessionId).state` first.
