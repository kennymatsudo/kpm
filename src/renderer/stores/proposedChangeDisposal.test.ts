import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi } from '../../../tests/mocks/electron-api';
import { useGeneralSettingsStore } from './generalSettingsStore';
import { useProposedChangeDisposal } from './proposedChangeDisposal';
import type { ProposedChangeInput } from './proposedChangeDisposal';
import { usePlanDomainStore } from './projectDomains';

describe('Proposed Change disposal', () => {
  beforeEach(() => {
    installMockApi();
    useGeneralSettingsStore.setState({ approvalMode: 'manual', approvalModeLoaded: true });
    useProposedChangeDisposal.getState().resetProject();
  });

  it('merges repeated document proposals while preserving the original diff base', () => {
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({
      type: 'document',
      projectId: 'project-1',
      filePath: 'guide.md',
      content: 'version one',
      oldContent: 'on disk',
    });
    disposal.propose({
      type: 'document',
      projectId: 'project-1',
      filePath: 'guide.md',
      content: 'version two',
      oldContent: 'intermediate',
    });

    expect(useProposedChangeDisposal.getState().pending).toMatchObject([
      { type: 'document', filePath: 'guide.md', content: 'version two', oldContent: 'on disk' },
    ]);
  });

  it('always queues Review Thread replies even when global auto-apply is enabled', () => {
    useGeneralSettingsStore.setState({ approvalMode: 'auto_apply', approvalModeLoaded: true });

    useProposedChangeDisposal.getState().propose({
      type: 'review-reply', projectId: 'project-1', sessionId: 'session-1', threadId: 'thread-1',
      threadUrl: 'https://example.test/thread', threadTitle: 'Fix this', threadLocation: 'file.ts:1',
      latestCommentPreview: null, body: 'Fixed', resolve: true,
    }, { policy: 'follow_global_mode' });

    expect(useProposedChangeDisposal.getState().pending).toHaveLength(1);
  });

  it('executes edited plan actions through the same disposal attempt', async () => {
    const executePlanActions = vi.fn().mockResolvedValue({ applied: 1, skipped: [] });
    usePlanDomainStore.setState({ executePlanActions });
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({
      type: 'plan-actions',
      projectId: 'project-1',
      actions: [{ type: 'create_item', title: 'Targeted item', parent_id: null }],
    });
    const id = useProposedChangeDisposal.getState().pending[0].id;
    const editedActions = [{
      type: 'create_item' as const,
      title: 'Targeted item',
      parent_id: null,
      primary_repo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      affected_repo_ids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    }];

    await disposal.approve(id, { type: 'plan-actions', actions: editedActions });

    expect(executePlanActions).toHaveBeenCalledWith(editedActions);
  });

  it('preserves approved edits when execution fails', async () => {
    const api = installMockApi();
    api.fileExplorer.writeFile.mockResolvedValue({ success: false, error: 'disk full' });
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({
      type: 'document', projectId: 'project-1', filePath: 'guide.md', content: 'draft', oldContent: 'old',
    });
    const id = useProposedChangeDisposal.getState().pending[0].id;

    await disposal.approve(id, { type: 'document', content: 'edited draft' });

    expect(useProposedChangeDisposal.getState().pending[0]).toMatchObject({
      id, content: 'edited draft', error: 'disk full',
    });
  });

  it('surfaces a failed auto-apply for manual recovery', async () => {
    const api = installMockApi();
    useGeneralSettingsStore.setState({ approvalMode: 'auto_apply', approvalModeLoaded: true });
    api.fileExplorer.delete.mockResolvedValue({ success: false, error: 'permission denied' });

    useProposedChangeDisposal.getState().propose({
      type: 'delete', projectId: 'project-1', filePath: 'old.md', isDirectory: false,
    });
    await vi.waitFor(() => expect(useProposedChangeDisposal.getState().pending).toHaveLength(1));

    expect(useProposedChangeDisposal.getState().pending[0]).toMatchObject({
      type: 'delete', policy: 'review_required', error: 'permission denied',
    });
  });

  it('keeps a matching proposal received during execution as a successor', async () => {
    const api = installMockApi();
    let finishWrite!: () => void;
    api.fileExplorer.writeFile.mockReturnValue(new Promise((resolve) => {
      finishWrite = () => resolve({ success: true });
    }));
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({
      type: 'document', projectId: 'project-1', filePath: 'guide.md', content: 'version one', oldContent: 'disk',
    });
    const firstId = useProposedChangeDisposal.getState().pending[0].id;
    const applying = disposal.approve(firstId);
    await vi.waitFor(() => expect(useProposedChangeDisposal.getState().activeAttempt?.id).toBe(firstId));

    disposal.propose({
      type: 'document', projectId: 'project-1', filePath: 'guide.md', content: 'version two', oldContent: 'disk',
    });
    finishWrite();
    await applying;

    expect(useProposedChangeDisposal.getState().pending).toMatchObject([
      { type: 'document', filePath: 'guide.md', content: 'version two' },
    ]);
  });

  it('serializes auto-applied mutations in intake order', async () => {
    const api = installMockApi();
    useGeneralSettingsStore.setState({ approvalMode: 'auto_apply', approvalModeLoaded: true });
    let finishFirst!: () => void;
    api.fileExplorer.delete
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = () => resolve({ success: true }); }))
      .mockResolvedValueOnce({ success: true });

    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({ type: 'delete', projectId: 'project-1', filePath: 'first.md', isDirectory: false });
    disposal.propose({ type: 'delete', projectId: 'project-1', filePath: 'second.md', isDirectory: false });
    await vi.waitFor(() => expect(api.fileExplorer.delete).toHaveBeenCalledTimes(1));
    finishFirst();
    await vi.waitFor(() => expect(api.fileExplorer.delete).toHaveBeenCalledTimes(2));

    expect(api.fileExplorer.delete.mock.calls.map(([request]) => request.path)).toEqual(['first.md', 'second.md']);
  });

  it('does not leak an in-flight failure across project reset', async () => {
    const api = installMockApi();
    useGeneralSettingsStore.setState({ approvalMode: 'auto_apply', approvalModeLoaded: true });
    let failWrite!: () => void;
    api.fileExplorer.writeFile.mockReturnValue(new Promise((resolve) => {
      failWrite = () => resolve({ success: false, error: 'old project failed' });
    }));
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({
      type: 'document', projectId: 'project-a', filePath: 'a.md', content: 'new', oldContent: 'old',
    });
    await vi.waitFor(() => expect(useProposedChangeDisposal.getState().activeAttempt).not.toBeNull());

    disposal.resetProject();
    failWrite();
    await vi.waitFor(() => expect(useProposedChangeDisposal.getState().activeAttempt).toBeNull());
    expect(useProposedChangeDisposal.getState().pending).toEqual([]);
  });

  it('retains failures for retry and removes them after a successful retry', async () => {
    const api = installMockApi();
    api.fileExplorer.delete
      .mockResolvedValueOnce({ success: false, error: 'busy' })
      .mockResolvedValueOnce({ success: true });
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({ type: 'delete', projectId: 'project-1', filePath: 'old.md', isDirectory: false });
    const id = useProposedChangeDisposal.getState().pending[0].id;

    expect(await disposal.approve(id)).toEqual({ kind: 'failed', error: 'busy' });
    expect(await disposal.retry(id)).toEqual({ kind: 'applied' });
    expect(useProposedChangeDisposal.getState().pending).toEqual([]);
  });

  it('dismisses without executing the mutation', () => {
    const api = installMockApi();
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({ type: 'delete', projectId: 'project-1', filePath: 'old.md', isDirectory: false });
    disposal.dismiss(useProposedChangeDisposal.getState().pending[0].id);

    expect(useProposedChangeDisposal.getState().pending).toEqual([]);
    expect(api.fileExplorer.delete).not.toHaveBeenCalled();
  });

  it.each([
    {
      kind: 'plan-actions',
      first: { type: 'plan-actions', projectId: 'project-1', actions: [{ type: 'update_item', item_id: 'item-1', changes: { title: 'one' } } as never] },
      second: { type: 'plan-actions', projectId: 'project-1', actions: [{ type: 'update_item', item_id: 'item-1', changes: { title: 'two' } } as never] },
      expected: { type: 'plan-actions', actions: [{ item_id: 'item-1', changes: { title: 'two' } }] },
    },
    {
      kind: 'context-file',
      first: { type: 'context-file', projectId: 'project-1', oldContent: 'disk', newContent: 'one' },
      second: { type: 'context-file', projectId: 'project-1', oldContent: 'intermediate', newContent: 'two' },
      expected: { type: 'context-file', oldContent: 'disk', newContent: 'two' },
    },
    {
      kind: 'document',
      first: { type: 'document', projectId: 'project-1', filePath: 'same.md', oldContent: 'disk', content: 'one' },
      second: { type: 'document', projectId: 'project-1', filePath: 'same.md', oldContent: 'intermediate', content: 'two' },
      expected: { type: 'document', oldContent: 'disk', content: 'two' },
    },
    {
      kind: 'move',
      first: { type: 'move', projectId: 'project-1', sourcePath: 'a.md', targetPath: 'b.md' },
      second: { type: 'move', projectId: 'project-1', sourcePath: 'a.md', targetPath: 'b.md' },
      expected: { type: 'move', sourcePath: 'a.md', targetPath: 'b.md' },
    },
    {
      kind: 'delete',
      first: { type: 'delete', projectId: 'project-1', filePath: 'same.md', isDirectory: false },
      second: { type: 'delete', projectId: 'project-1', filePath: 'same.md', isDirectory: false },
      expected: { type: 'delete', filePath: 'same.md', isDirectory: false },
    },
    {
      kind: 'review-reply',
      first: { type: 'review-reply', projectId: 'project-1', sessionId: 's1', threadId: 't1', threadUrl: 'url', threadTitle: 'title', threadLocation: 'a.ts:1', latestCommentPreview: null, body: 'one', resolve: false },
      second: { type: 'review-reply', projectId: 'project-1', sessionId: 's1', threadId: 't1', threadUrl: 'url', threadTitle: 'title', threadLocation: 'a.ts:1', latestCommentPreview: null, body: 'two', resolve: true },
      expected: { type: 'review-reply', body: 'two', resolve: true },
    },
  ] satisfies { kind: string; first: ProposedChangeInput; second: ProposedChangeInput; expected: object }[])(
    'applies the $kind adapter identity and merge contract', ({ first, second, expected }) => {
      const disposal = useProposedChangeDisposal.getState();
      disposal.propose(first);
      disposal.propose(second);
      expect(useProposedChangeDisposal.getState().pending).toHaveLength(1);
      expect(useProposedChangeDisposal.getState().pending[0]).toMatchObject(expected);
    },
  );

  it('honors forced review even when global auto-apply is enabled', () => {
    const api = installMockApi();
    useGeneralSettingsStore.setState({ approvalMode: 'auto_apply', approvalModeLoaded: true });
    useProposedChangeDisposal.getState().propose({
      type: 'document', projectId: 'project-1', filePath: 'review.md', content: 'new', oldContent: 'old',
    }, { policy: 'review_required' });

    expect(useProposedChangeDisposal.getState().pending).toHaveLength(1);
    expect(api.fileExplorer.writeFile).not.toHaveBeenCalled();
  });

  it('removes an applied-with-warning attempt from the pending projection', async () => {
    usePlanDomainStore.setState({
      executePlanActions: vi.fn().mockResolvedValue({ applied: 0, skipped: [] }),
    });
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({
      type: 'plan-actions', projectId: 'project-1',
      actions: [{ type: 'update_item', item_id: 'item-1', changes: { title: 'new' } } as never],
    });
    const id = useProposedChangeDisposal.getState().pending[0].id;

    expect(await disposal.approve(id)).toEqual({ kind: 'applied_with_warning', warning: 'No changes were applied' });
    expect(useProposedChangeDisposal.getState().pending).toEqual([]);
  });

  it('rejects edits for a non-editable Proposed Change kind', async () => {
    const disposal = useProposedChangeDisposal.getState();
    disposal.propose({ type: 'delete', projectId: 'project-1', filePath: 'old.md', isDirectory: false });
    const id = useProposedChangeDisposal.getState().pending[0].id;

    await expect(disposal.approve(id, { type: 'document', content: 'invalid' })).rejects.toThrow(
      'Edits for document cannot be applied to delete',
    );
  });
});
