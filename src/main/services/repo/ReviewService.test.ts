import { describe, expect, it, vi } from 'vitest';
import type { DevSession, ReviewTask } from '../../../shared/types';
import { createReviewService } from './ReviewService';

function createSession(): DevSession {
  return {
    id: 'session-1',
    project_id: 'project-1',
    plan_item_id: 'plan-1',
    repo_id: 'repo-1',
    name: 'Review session',
    worktree_path: '/tmp/worktree',
    branch_name: 'feature/test',
    base_branch: 'main',
    base_sha: null,
    status: 'inactive',
    agent_type: 'claude',
    execution_mode: 'standard',
    review_policy: 'auto',
    automation_phase: null,
    initial_instructions: 'Do the work',
    pr_number: 42,
    pr_url: 'https://github.com/acme/repo/pull/42',
    pr_state: 'OPEN',
    review_state: 'CHANGES_REQUESTED',
    merge_order: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
  };
}

function createTask(overrides: Partial<ReviewTask> = {}): ReviewTask {
  return {
    id: 'task-1',
    project_id: 'project-1',
    repo_id: 'repo-1',
    session_id: 'session-1',
    pr_number: 42,
    thread_id: 'thread-1',
    thread_url: 'https://github.com/acme/repo/pull/42#discussion_r1',
    path: 'src/file.ts',
    line: 10,
    source: 'human',
    status: 'assessed',
    internal_state: null,
    disposition: 'implement',
    rationale: 'Worth fixing',
    draft_reply: null,
    priority: 'high',
    title: 'Review feedback on src/file.ts:10',
    latest_comment_preview: 'Please fix this',
    last_seen_comment_id: 'comment-1',
    last_seen_updated_at: '2026-01-01T00:00:00.000Z',
    last_agent_run_at: null,
    last_posted_reply_id: null,
    error: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

function createService(tasks: ReviewTask[]) {
  const session = createSession();
  return createReviewService({
    devSessions: {
      get: vi.fn(() => session),
    },
    reviewTasks: {
      getByRepoPr: vi.fn(() => tasks),
      updateStatus: vi.fn((id: string, status: ReviewTask['status'], meta?: Partial<ReviewTask>) => {
        const task = tasks.find((candidate) => candidate.id === id);
        if (!task) return undefined;
        Object.assign(task, { status, ...meta });
        return task;
      }),
    },
    reviewOwnership: {
      get: vi.fn(),
      set: vi.fn(),
    },
    reviewSyncState: {
      get: vi.fn(),
      upsert: vi.fn(),
      updateError: vi.fn(),
    },
    gitHubService: {},
    devSessionService: {},
  } as never);
}

describe('ReviewService', () => {
  it('queues assessed implement tasks for review automation', () => {
    const task = createTask();
    const service = createService([task]);

    const result = service.queueReviewTasks('session-1', [task.id]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: task.id,
      status: 'in_progress',
      internal_state: 'implementation_queued',
    });
  });

  it('does not queue assessed push-back tasks without implementation work', () => {
    const task = createTask({
      disposition: 'push_back',
      draft_reply: null,
    });
    const service = createService([task]);

    const result = service.queueReviewTasks('session-1', [task.id]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
    expect(task.status).toBe('assessed');
  });
});
