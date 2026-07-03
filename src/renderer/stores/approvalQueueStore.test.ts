import { beforeEach, describe, expect, it } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { useApprovalQueueStore } from './approvalQueueStore';
import { useDevSessionsStore } from './devSessions';

describe('approvalQueueStore — review reply flow', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useApprovalQueueStore.getState().clearQueue();
    useDevSessionsStore.getState().reset();
  });

  it('posts approved review replies and updates the review inbox cache', async () => {
    useDevSessionsStore.setState({ projectId: 'project-1' });

    api.review.replyToThread.mockResolvedValue({
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
    api.devSessions.getByProjectWithPlanItems.mockResolvedValue({
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
        base_sha: null,
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
    expect(api.review.replyToThread).toHaveBeenCalledWith({
      sessionId: 'dev-session-1',
      threadId: 'thread-1',
      body: 'Fixed in the latest commit.',
      resolve: true,
    });
    expect(useDevSessionsStore.getState().reviewInboxBySessionId.get('dev-session-1')).toEqual({
      session_id: 'dev-session-1',
      fetched_at: '2024-01-03T00:00:00.000Z',
      ownership: null,
      sync_state: null,
      snapshot: null,
      tasks: [],
    });
    expect(api.devSessions.getByProjectWithPlanItems).toHaveBeenCalledWith({ projectId: 'project-1' });
  });
});

describe('approvalQueueStore — file delete flow', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useApprovalQueueStore.getState().clearQueue();
  });

  it('queues a delete proposal for explicit confirmation rather than deleting immediately', () => {
    useApprovalQueueStore.getState().processFileDelete('project-1', 'drafts/old.md', false);

    const queue = useApprovalQueueStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ type: 'delete', filePath: 'drafts/old.md', isDirectory: false });
    // Nothing is deleted until the user approves.
    expect(api.fileExplorer.delete).not.toHaveBeenCalled();
  });

  it('dedupes repeat proposals for the same path', () => {
    const store = useApprovalQueueStore.getState();
    store.processFileDelete('project-1', 'drafts/old.md', false);
    store.processFileDelete('project-1', 'drafts/old.md', false);

    expect(useApprovalQueueStore.getState().queue).toHaveLength(1);
  });

  it('deletes via the file explorer only when executed', async () => {
    const result = await useApprovalQueueStore.getState().executeFileDelete('project-1', 'drafts/old.md');

    expect(result).toEqual({ success: true });
    expect(api.fileExplorer.delete).toHaveBeenCalledWith({ projectId: 'project-1', path: 'drafts/old.md' });
  });
});

describe('approvalQueueStore — same-file document edit accumulation contract', () => {
  // The store dedupes same-file proposals and keeps the LATEST content, so it
  // relies on the producer sending CUMULATIVE snapshots. These tests pin that
  // contract: the interception/tool side (proven in
  // src/main/claude/documentEditAccumulation.test.ts) must accumulate, or edits
  // are lost here.
  const DISK = ['# Guide', 'Section A: old-A', 'Section B: old-B', ''].join('\n');
  // NON-cumulative snapshots: what the built-in Edit interceptor emits, since it
  // re-reads unchanged disk for each edit and never accumulates.
  const snapA = DISK.replace('Section A: old-A', 'Section A: NEW-A'); // edit A only
  const snapB = DISK.replace('Section B: old-B', 'Section B: NEW-B'); // edit B only
  // Cumulative snapshot: what the propose_document_edit tool emits via the
  // pendingDocumentContent cache (edit B applied on top of edit A).
  const cumAB = snapA.replace('Section B: old-B', 'Section B: NEW-B'); // edits A + B

  beforeEach(() => {
    installMockApi();
    useApprovalQueueStore.getState().clearQueue();
    useApprovalQueueStore.setState({ userMinimized: false });
  });

  it('collapses same-file proposals to one card keeping the latest content (would lose edits if the producer did not accumulate)', () => {
    const store = useApprovalQueueStore.getState();
    store.processFileUpdate('project-1', 'guide.md', snapA, DISK);
    store.processFileUpdate('project-1', 'guide.md', snapB, DISK);

    const docs = useApprovalQueueStore.getState().queue.filter((i) => i.type === 'document');
    // Same-file edits collapse into ONE approval card keeping the LAST snapshot.
    // This is why the producer (interception/tool) must send cumulative content;
    // with these non-cumulative inputs, edit A would be lost.
    expect(docs).toHaveLength(1);
    const content = (docs[0] as { content: string }).content;
    expect(content).toBe(snapB);
    expect(content).not.toContain('NEW-A');
    expect(content).toContain('NEW-B');
  });

  it('preserves both edits when fed CUMULATIVE snapshots (propose_document_edit path)', () => {
    const store = useApprovalQueueStore.getState();
    store.processFileUpdate('project-1', 'guide.md', snapA, DISK);
    store.processFileUpdate('project-1', 'guide.md', cumAB, DISK);

    const docs = useApprovalQueueStore.getState().queue.filter((i) => i.type === 'document');
    expect(docs).toHaveLength(1);
    const content = (docs[0] as { content: string }).content;
    // The dedup itself is fine — when the producer accumulates, nothing is lost.
    expect(content).toBe(cumAB);
    expect(content).toContain('NEW-A');
    expect(content).toContain('NEW-B');
  });
});
