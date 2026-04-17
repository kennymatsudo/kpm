import { useApprovalQueueStore } from './approvalQueueStore';
import { useDevSessionsStore } from './devSessions';


  beforeEach(() => {
    useApprovalQueueStore.getState().clearQueue();
    useDevSessionsStore.getState().reset();
  });

  it('posts approved review replies and updates the review inbox cache', async () => {
    useDevSessionsStore.setState({ projectId: 'project-1' });

      success: true,
      inbox: {
        session_id: 'dev-session-1',
        fetched_at: '2024-01-03T00:00:00.000Z',
        ownership: null,
        sync_state: null,
        snapshot: null,
        tasks: [],
      },
    });
      success: true,
      sessions: [{
        id: 'dev-session-1',
        project_id: 'project-1',
        plan_item_id: 'plan-1',
        repo_id: 'repo-1',
        name: 'Implement feature',
        repo_name: 'my-repo',
        branch_name: 'kpm/test-branch',
        base_branch: 'main',
        worktree_path: '/tmp/worktree',
        status: 'active',
        initial_instructions: 'Implement the task',
        pr_number: 42,
        pr_url: 'https://github.com/test/repo/pull/42',
        pr_state: 'OPEN',
        review_state: 'CHANGES_REQUESTED',
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
      }],
    });

    const result = await useApprovalQueueStore.getState().executeReviewReply({
      sessionId: 'dev-session-1',
      threadId: 'thread-1',
      body: 'Fixed in the latest commit.',
      resolve: true,
    });

    expect(result).toEqual({ success: true });
      'dev-session-1',
      'thread-1',
      'Fixed in the latest commit.',
      true
    );
    expect(useDevSessionsStore.getState().reviewInboxBySessionId.get('dev-session-1')).toEqual({
      session_id: 'dev-session-1',
      fetched_at: '2024-01-03T00:00:00.000Z',
      ownership: null,
      sync_state: null,
      snapshot: null,
      tasks: [],
    });
  });
});
