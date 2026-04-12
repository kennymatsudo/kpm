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




## Architecture

```text
Board card (drag to in_progress / play button)
  ↓ IPC: agent-session:create-and-start
Main process
  ├── DevSessionService
  │   ├── resume latest inactive/pending session for the plan item when possible
  │   └── otherwise create pending session + worktree metadata
  ├── AgentSessionManager
  │   ├── ClaudeSdkSession   — Claude via Agent SDK
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
```

## Session Lifecycle

### 1. Trigger

User drags a card to `in_progress` or clicks `Play`.

The board start flow uses `agent-session:create-and-start`, but it now prefers continuing prior work:


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
- `ready_for_review`
- `needs_attention`


### Implementation completion

When the implementation session completes:


### Review completion

When the review session completes:


There is no infinite review/fix loop in the board workflow. The review runs once.

### Race condition guard


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


### Review diff


## Completion Detection


## Stop / Resume Semantics

Expected behavior:

- `Stop` terminates the live implementation run and the session becomes `inactive`
- clicking `Play` again on the same task should prefer resuming/continuing the most recent session for that plan item and repo



| File | Purpose |
|------|---------|
| `src/shared/agent-types.ts` | shared types + `toReviewSessionId` / `toImplSessionId` helpers |
| `src/main/services/agents/autoReview.ts` | one-shot opposing review launch + findings parsing; accepts `baseBranch` |

## Review Session ID

The review session ID is always `toReviewSessionId(implSessionId)` from `shared/agent-types.ts`. **Do not** inline the string derivation (`` `${id}-review` ``) anywhere. Use the helper; its inverse is `toImplSessionId`.

## Session Registry Lifetime

`AgentSessionManager` keeps sessions in its registry for **30 minutes** after they reach a terminal state (`complete/failed/stopped`), then evicts them automatically. This window covers follow-up requests. Do not rely on `getByDevSession` returning a session beyond that window — `sendAgentFollowUp` falls back to a full restart when the session is gone.

## Completion Stats


## Common Pitfalls

- Do not assume board `Play` always means "new worktree". It should usually mean "continue existing work" when prior work exists.
- Do not rely on renderer-only state for orchestration. Use persisted `automation_phase`.
- Do not design the board UX around explicit review-tab interactions unless you intentionally want to reintroduce them.
- Do not reintroduce a blocking commit modal. Commit confirmation is modal; commit execution is backgrounded.
- Do not inline `` `${id}-review` `` — use `toReviewSessionId` / `toImplSessionId` from `shared/agent-types.ts`.
- Do not send an automated review follow-up if the impl session is already active. Check `agentSessionManager.getByDevSession(implSessionId).state` first.
