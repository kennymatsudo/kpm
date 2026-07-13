import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../../tests/mocks/electron-api';
import { useDevSessionsStore } from './index';

function createDevSession() {
  return {
    id: 'dev-session-1',
    project_id: 'project-1',
    plan_item_id: 'plan-1',
    repo_id: 'repo-1',
    name: 'Implement feature',
    repo_name: 'my-repo',
    branch_name: 'kpm/test-branch',
    base_branch: 'main',
    base_sha: null,
    worktree_path: '/tmp/worktree',
    status: 'inactive' as const,
    initial_instructions: 'Implement the task',
    automation_phase: null,
    playbook_id: null,
    playbook_snapshot: null,
    current_step_id: null,
    step_pass_counts: null,
    paused_reason: null,
    pr_number: 42,
    pr_url: 'https://github.com/test/repo/pull/42',
    pr_state: 'OPEN' as const,
    review_state: 'CHANGES_REQUESTED' as const,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    completed_at: null,
    latest_agent_review: null,
    plan_item: {
      id: 'plan-1',
      title: 'Implement feature',
      description: null,
      label: 'task',
      external_key: null,
    },
  };
}

function createPersistedReview() {
  return {
    id: 'agent-review-1',
    implementation_session_id: 'dev-session-1',
    review_session_id: 'dev-session-1-review',
    reviewer_agent: 'codex' as const,
    status: 'complete' as const,
    diff_fingerprint: null,
    raw_output: '{"findings":[]}',
    error: null,
    findings: [{
      severity: 'warning' as const,
      file: 'src/file.ts',
      line: 10,
      description: 'Please handle undefined input.',
      agent: 'codex' as const,
      source: 'agent' as const,
    }],
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
    completed_at: '2024-01-02T00:00:00.000Z',
  };
}

function createReviewInbox(sessionId = 'dev-session-1') {
  return {
    session_id: sessionId,
    fetched_at: '2024-01-02T00:00:00.000Z',
    ownership: {
      repo_id: 'repo-1',
      pr_number: 42,
      session_id: sessionId,
      created_at: '2024-01-02T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    },
    sync_state: {
      repo_id: 'repo-1',
      pr_number: 42,
      session_id: sessionId,
      last_fetched_at: '2024-01-02T00:00:00.000Z',
      last_successful_fetched_at: '2024-01-02T00:00:00.000Z',
      last_head_oid: 'abcdef1234567890',
      last_review_decision: 'CHANGES_REQUESTED' as const,
      last_pr_updated_at: '2024-01-02T00:00:00.000Z',
      probe_digest: 'probe-1',
      last_error: null,
    },
    snapshot: {
      prNumber: 42,
      prUrl: 'https://github.com/test/repo/pull/42',
      title: 'Implement feature',
      state: 'OPEN' as const,
      reviewDecision: 'CHANGES_REQUESTED' as const,
      headOid: 'abcdef1234567890',
      baseRefName: 'main',
      headRefName: 'kpm/test-branch',
      fetchedAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      summary: {
        totalThreads: 1,
        unresolvedThreads: 1,
        resolvedThreads: 0,
        outdatedThreads: 0,
        actionableThreads: 1,
        humanThreads: 1,
        botOnlyThreads: 0,
        topLevelReviewCount: 0,
        conversationCommentCount: 0,
      },
      threads: [{
        id: 'thread-1',
        url: 'https://github.com/test/repo/pull/42#discussion_r1',
        path: 'src/file.ts',
        line: 10,
        startLine: null,
        subjectType: 'LINE',
        diffSide: 'RIGHT' as const,
        isResolved: false,
        isOutdated: false,
        resolvedBy: null,
        updatedAt: '2024-01-02T00:00:00.000Z',
        participants: ['reviewer'],
        comments: [{
          id: 'comment-1',
          databaseId: 1,
          url: 'https://github.com/test/repo/pull/42#discussion_r1',
          author: 'reviewer',
          authorType: 'User' as const,
          authorAssociation: 'MEMBER',
          body: 'Please fix this',
          createdAt: '2024-01-02T00:00:00.000Z',
          replyToId: null,
          viewerCanUpdate: false,
          viewerCanDelete: false,
        }],
        hasBotOnlyComments: false,
        hasHumanReviewerComment: true,
        latestCommentPreview: 'Please fix this',
      }],
      topLevelReviews: [],
      conversationComments: [],
    },
    tasks: [{
      id: 'task-1',
      project_id: 'project-1',
      repo_id: 'repo-1',
      session_id: sessionId,
      pr_number: 42,
      thread_id: 'thread-1',
      thread_url: 'https://github.com/test/repo/pull/42#discussion_r1',
      path: 'src/file.ts',
      line: 10,
      source: 'human' as const,
      status: 'needs_review' as const,
      internal_state: null,
      disposition: null,
      rationale: null,
      draft_reply: null,
      priority: 'high' as const,
      title: 'Review feedback on src/file.ts:10',
      latest_comment_preview: 'Please fix this',
      last_seen_comment_id: 'comment-1',
      last_seen_updated_at: '2024-01-02T00:00:00.000Z',
      last_agent_run_at: null,
      last_posted_reply_id: null,
      error: null,
      created_at: '2024-01-02T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
      completed_at: null,
    }],
  };
}

describe('devSessionsStore', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useDevSessionsStore.getState().reset();
    vi.clearAllMocks();
  });

  it('loads persisted playbook step costs for a dev session', async () => {
    api.usage.getDevSessionStepCosts.mockResolvedValue({ costs: { implement: 1500, review: 2500 } });

    await useDevSessionsStore.getState().loadStepCosts('dev-session-1');

    expect(api.usage.getDevSessionStepCosts).toHaveBeenCalledWith({ devSessionId: 'dev-session-1' });
    expect(useDevSessionsStore.getState().stepCostsBySessionId.get('dev-session-1')).toEqual({ implement: 1500, review: 2500 });
  });

  it('clears stale failed commit state when an agent run starts again', () => {
    useDevSessionsStore.getState().setCommitState('dev-session-1', {
      status: 'failed',
      message: 'Commit message',
      startedAt: Date.now(),
      error: 'Commit checks failed',
    });

    useDevSessionsStore.getState().handleAgentStateChanged('dev-session-1', 'working');

    expect(useDevSessionsStore.getState().commitStateBySessionId.has('dev-session-1')).toBe(false);
  });

  it('caches review inbox by session id', async () => {
    const inbox = createReviewInbox();
    api.review.getInbox.mockResolvedValue({ success: true, inbox });

    const first = await useDevSessionsStore.getState().loadReviewInbox('dev-session-1');
    const second = await useDevSessionsStore.getState().loadReviewInbox('dev-session-1');

    expect(first).toEqual({ success: true, inbox });
    expect(second).toEqual({ success: true, inbox });
    expect(api.review.getInbox).toHaveBeenCalledTimes(1);
    expect(useDevSessionsStore.getState().reviewInboxBySessionId.get('dev-session-1')).toEqual(inbox);
  });

  it('does not mark closed review threads as actionable card attention', async () => {
    const base = createReviewInbox();
    const inbox = {
      ...base,
      snapshot: {
        ...base.snapshot,
        summary: {
          ...base.snapshot.summary,
          unresolvedThreads: 0,
          resolvedThreads: 1,
          actionableThreads: 0,
        },
        threads: base.snapshot.threads.map((thread) => ({
          ...thread,
          isResolved: true,
          resolvedBy: 'reviewer',
        })),
      },
      tasks: base.tasks.map((task) => ({
        ...task,
        status: 'assessed' as const,
        internal_state: 'stale' as const,
        disposition: 'needs_user_input' as const,
        error: 'Previous assessment failed',
      })),
    };
    api.review.getInbox.mockResolvedValue({ success: true, inbox });

    await useDevSessionsStore.getState().loadReviewInbox('dev-session-1');

    expect(useDevSessionsStore.getState().reviewActionableBySessionId.get('dev-session-1')).toEqual({
      sessionId: 'dev-session-1',
      hasActionable: false,
      counts: { needsInput: 0, failed: 0, stale: 0, errored: 0 },
    });
  });

  it('updates card attention from the latest open Review Thread facts', async () => {
    const base = createReviewInbox();
    const inbox = {
      ...base,
      tasks: base.tasks.map((task) => ({
        ...task,
        status: 'assessed' as const,
        disposition: 'needs_user_input' as const,
      })),
    };
    api.review.getInbox.mockResolvedValue({ success: true, inbox });

    await useDevSessionsStore.getState().loadReviewInbox('dev-session-1');

    expect(useDevSessionsStore.getState().reviewActionableBySessionId.get('dev-session-1')).toEqual({
      sessionId: 'dev-session-1',
      hasActionable: true,
      counts: { needsInput: 1, failed: 0, stale: 0, errored: 0 },
    });
  });

  it('tracks pending review reassessment task ids while the request is running', async () => {
    const inbox = createReviewInbox();
    useDevSessionsStore.setState({
      reviewInboxBySessionId: new Map([['dev-session-1', inbox]]),
    });

    let resolveAssessment: (value: { success: true; inbox: typeof inbox; results: []; errors: [] }) => void;
    api.review.assessThreads.mockReturnValue(new Promise((resolve) => {
      resolveAssessment = resolve;
    }));

    const resultPromise = useDevSessionsStore.getState().assessReviewThreads('dev-session-1', { reassessAll: true });

    expect(api.review.assessThreads).toHaveBeenCalledWith({ sessionId: 'dev-session-1', reassessAll: true });
    expect(useDevSessionsStore.getState().reviewAssessmentPendingBySessionId.get('dev-session-1')).toMatchObject({
      scope: 'all',
      taskIds: ['task-1'],
    });

    resolveAssessment!({ success: true, inbox, results: [], errors: [] });
    await expect(resultPromise).resolves.toEqual({ success: true, inbox });
    expect(useDevSessionsStore.getState().reviewAssessmentPendingBySessionId.has('dev-session-1')).toBe(false);
  });

  it('triggers review automation through the review service and refreshes sessions', async () => {
    const session = createDevSession();
    const inbox = createReviewInbox();
    useDevSessionsStore.setState({ projectId: 'project-1' });
    api.review.triggerAutomation.mockResolvedValue({
      success: true,
      inbox,
      taskIds: ['task-1'],
      context: 'THREAD thread-1',
    });
    api.devSessions.getByProjectWithPlanItems.mockResolvedValue({ success: true, sessions: [{ ...session, status: 'active' }] });

    const result = await useDevSessionsStore.getState().triggerReviewAutomation('dev-session-1', ['task-1']);

    expect(api.review.triggerAutomation).toHaveBeenCalledWith({ sessionId: 'dev-session-1', taskIds: ['task-1'] });
    expect(result).toEqual({
      success: true,
      inbox,
      taskIds: ['task-1'],
      context: 'THREAD thread-1',
    });
    expect(useDevSessionsStore.getState().reviewInboxBySessionId.get('dev-session-1')).toEqual(inbox);
  });

  it('loads PR context through the store after checking GitHub auth', async () => {
    api.github.checkAuth.mockResolvedValue({
      success: true,
      authenticated: true,
      account: 'test-user',
    });
    api.github.buildPrContext.mockResolvedValue({
      success: true,
      suggestedTitle: 'Implement feature',
      body: '## Summary',
      branch: 'feature/test',
      baseBranch: 'main',
      hasCommits: true,
      prTemplate: null,
    });
    api.github.generatePrContent.mockResolvedValue({
      success: true,
      title: 'AI: Implement feature',
      body: 'AI generated description',
    });

    const result = await useDevSessionsStore.getState().loadPrContext('dev-session-1');

    expect(api.github.checkAuth).toHaveBeenCalledWith({ sessionId: 'dev-session-1' });
    expect(api.github.buildPrContext).toHaveBeenCalledWith({ sessionId: 'dev-session-1' });
    expect(api.github.generatePrContent).toHaveBeenCalledWith({
      sessionId: 'dev-session-1',
      rawTitle: 'Implement feature',
      rawBody: '## Summary',
      prTemplate: null,
      diff: '',
      commitLog: '',
      featureContextPath: null,
    });
    expect(result).toEqual({
      success: true,
      context: {
        suggestedTitle: 'AI: Implement feature',
        body: 'AI generated description',
        branch: 'feature/test',
        baseBranch: 'main',
        hasCommits: true,
        prTemplate: null,
        aiGenerated: true,
        featureContextPath: null,
      },
    });
    expect(useDevSessionsStore.getState().prContextBySessionId.get('dev-session-1')).toEqual(
      result.context
    );
  });

  it('returns raw PR context when generated content is unavailable', async () => {
    api.github.checkAuth.mockResolvedValue({
      success: true,
      authenticated: true,
      account: 'test-user',
    });
    api.github.buildPrContext.mockResolvedValue({
      success: true,
      suggestedTitle: 'Implement feature',
      body: '## Summary',
      branch: 'feature/test',
      baseBranch: 'main',
      hasCommits: true,
      prTemplate: null,
    });
    api.github.generatePrContent.mockResolvedValue({
      success: false,
      error: 'Generation failed',
    });

    const result = await useDevSessionsStore.getState().loadPrContext('dev-session-1', { force: true });

    expect(api.github.generatePrContent).toHaveBeenCalledWith({
      sessionId: 'dev-session-1',
      rawTitle: 'Implement feature',
      rawBody: '## Summary',
      prTemplate: null,
      diff: '',
      commitLog: '',
      featureContextPath: null,
    });
    expect(result).toEqual({
      success: true,
      context: {
        suggestedTitle: 'Implement feature',
        body: '## Summary',
        branch: 'feature/test',
        baseBranch: 'main',
        hasCommits: true,
        prTemplate: null,
        aiGenerated: false,
        featureContextPath: null,
      },
    });
  });

  it('passes selected feature context document when generating PR content', async () => {
    api.github.checkAuth.mockResolvedValue({
      success: true,
      authenticated: true,
      account: 'test-user',
    });
    api.github.buildPrContext.mockResolvedValue({
      success: true,
      suggestedTitle: 'Implement feature',
      body: '## Summary',
      branch: 'feature/test',
      baseBranch: 'main',
      hasCommits: true,
      prTemplate: null,
    });
    api.github.generatePrContent.mockResolvedValue({
      success: true,
      title: 'AI: Implement feature',
      body: 'AI generated description',
    });

    const result = await useDevSessionsStore.getState().loadPrContext('dev-session-1', {
      force: true,
      featureContextPath: 'docs/support-attachments.md',
    });

    expect(api.github.generatePrContent).toHaveBeenCalledWith({
      sessionId: 'dev-session-1',
      rawTitle: 'Implement feature',
      rawBody: '## Summary',
      prTemplate: null,
      diff: '',
      commitLog: '',
      featureContextPath: 'docs/support-attachments.md',
    });
    expect(result.context?.featureContextPath).toBe('docs/support-attachments.md');
    expect(useDevSessionsStore.getState().prContextBySessionId.get('dev-session-1')?.featureContextPath)
      .toBe('docs/support-attachments.md');
  });

  it('does not generate PR content when there are no commits ahead', async () => {
    api.github.checkAuth.mockResolvedValue({
      success: true,
      authenticated: true,
      account: 'test-user',
    });
    api.github.buildPrContext.mockResolvedValue({
      success: true,
      suggestedTitle: 'Implement feature',
      body: '',
      branch: 'feature/test',
      baseBranch: 'main',
      hasCommits: false,
      prTemplate: null,
    });

    const result = await useDevSessionsStore.getState().loadPrContext('dev-session-1', { force: true });

    expect(api.github.generatePrContent).not.toHaveBeenCalled();
    expect(result.context?.aiGenerated).toBe(false);
    expect(result.context?.hasCommits).toBe(false);
  });

  it('creates a pull request through the store and refreshes sessions', async () => {
    useDevSessionsStore.setState({ projectId: 'project-1' });
    api.github.createPr.mockResolvedValue({
      success: true,
      number: 17,
      url: 'https://github.com/test/repo/pull/17',
    });
    api.devSessions.getByProjectWithPlanItems.mockResolvedValue({ success: true, sessions: [] });

    const result = await useDevSessionsStore.getState().createPullRequest(
      'dev-session-1',
      'Implement feature',
      '## Summary',
      false
    );

    expect(api.github.createPr).toHaveBeenCalledWith({
      sessionId: 'dev-session-1',
      title: 'Implement feature',
      body: '## Summary',
      draft: false,
    });
    expect(result).toEqual({
      success: true,
      number: 17,
      url: 'https://github.com/test/repo/pull/17',
    });
  });

  it('stores review findings when a review agent completes', () => {
    const findings = [{
      severity: 'warning' as const,
      file: 'src/file.ts',
      line: 10,
      description: 'Please handle undefined input.',
      agent: 'claude' as const,
      source: 'agent' as const,
    }];

    useDevSessionsStore.getState().handleAgentComplete('dev-session-1-review', {
      filesChanged: 1,
      additions: 3,
      deletions: 1,
    }, findings);

    expect(useDevSessionsStore.getState().reviewFindingsBySessionId.get('dev-session-1-review')).toEqual(findings);
    expect(useDevSessionsStore.getState().questionBySessionId.get('dev-session-1-review')).toBeNull();
  });

  it('rehydrates persisted agent review findings when sessions reload', async () => {
    const persistedReview = createPersistedReview();
    const session = {
      ...createDevSession(),
      latest_agent_review: persistedReview,
    };

    api.devSessions.getByProjectWithPlanItems.mockResolvedValue({
      success: true,
      sessions: [session],
    });

    await useDevSessionsStore.getState().loadSessions('project-1');

    expect(useDevSessionsStore.getState().reviewFindingsBySessionId.get('dev-session-1')).toEqual(
      persistedReview.findings
    );
  });
});
