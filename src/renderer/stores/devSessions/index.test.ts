import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    worktree_path: '/tmp/worktree',
    status: 'inactive' as const,
    initial_instructions: 'Implement the task',
    pr_number: 42,
    pr_url: 'https://github.com/test/repo/pull/42',
    pr_state: 'OPEN' as const,
    review_state: 'CHANGES_REQUESTED' as const,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    completed_at: null,
    plan_item: {
      id: 'plan-1',
      title: 'Implement feature',
      description: null,
      label: 'task',
      external_key: null,
    },
  };
}

describe('devSessionsStore', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useDevSessionsStore.getState().reset();
    vi.clearAllMocks();
  });



  });

    const session = createDevSession();
      success: true,
    });
    api.devSessions.getByProjectWithPlanItems.mockResolvedValue({ success: true, sessions: [{ ...session, status: 'active' }] });


    expect(result).toEqual({
      success: true,
    });
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

    expect(api.github.checkAuth).toHaveBeenCalledWith('dev-session-1');
    expect(api.github.buildPrContext).toHaveBeenCalledWith('dev-session-1');
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
      },
    });
    expect(useDevSessionsStore.getState().prContextBySessionId.get('dev-session-1')).toEqual(
      result.context
    );
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

    expect(api.github.createPr).toHaveBeenCalledWith(
      'dev-session-1',
      'Implement feature',
      '## Summary',
      false
    );
    expect(result).toEqual({
      success: true,
      number: 17,
      url: 'https://github.com/test/repo/pull/17',
    });
  });
});
