import { describe, expect, it, vi } from 'vitest';
import type { DocumentSyncPreview } from '../../shared/types';
import {
  createDocumentSyncState,
  type DocumentSyncOperations,
  type DocumentSyncState,
} from './documentSyncState';

const preview: DocumentSyncPreview = {
  hasConflict: false,
  localChanged: true,
  remoteChanged: false,
  isInitialSync: false,
  hasContentDifference: true,
  localContent: 'local',
  remoteContent: 'remote',
  remoteVersion: 1,
  pushReceipt: 'push-receipt',
  pullReceipt: 'pull-receipt',
};

function createHarness(overrides: Partial<DocumentSyncOperations> = {}) {
  let state: DocumentSyncState;
  const operations: DocumentSyncOperations = {
    getPreview: vi.fn().mockResolvedValue({ success: true, data: preview }),
    push: vi.fn().mockResolvedValue({ success: true }),
    pull: vi.fn().mockResolvedValue({ success: true }),
    previewFailureMessage: 'Failed to load sync preview',
    pushFailureMessage: 'Failed to push to Linear',
    pullFailureMessage: 'Failed to pull from Linear',
    ...overrides,
  };

  state = createDocumentSyncState((next) => {
    state = { ...state, ...next };
  }, operations);

  return {
    get state() {
      return state;
    },
    operations,
  };
}

describe('createDocumentSyncState', () => {
  it('loads the preview through the shared operation', async () => {
    const harness = createHarness();

    await harness.state.loadSyncPreview('project-1', 'docs/spec.md');

    expect(harness.operations.getPreview).toHaveBeenCalledWith({
      projectId: 'project-1',
      documentPath: 'docs/spec.md',
    });
    expect(harness.state.syncPreview).toEqual(preview);
    expect(harness.state.syncError).toBeNull();
  });

  it('keeps the preview error local to the shared state', async () => {
    const harness = createHarness({
      getPreview: vi.fn().mockResolvedValue({ success: false, error: 'Preview expired' }),
    });

    await harness.state.loadSyncPreview('project-1', 'docs/spec.md');

    expect(harness.state.syncPreview).toBeNull();
    expect(harness.state.syncError).toBe('Preview expired');
  });

  it('uses the receipt and refreshes provider links after a successful sync', async () => {
    const afterSuccessfulSync = vi.fn().mockResolvedValue(undefined);
    const harness = createHarness({ afterSuccessfulSync });

    await expect(
      harness.state.executePush('project-1', 'docs/spec.md', 'push-receipt'),
    ).resolves.toEqual({ success: true });

    expect(harness.operations.push).toHaveBeenCalledWith({
      projectId: 'project-1',
      documentPath: 'docs/spec.md',
      syncReceipt: 'push-receipt',
    });
    expect(afterSuccessfulSync).toHaveBeenCalledWith('project-1');
  });

  it('returns and records an action failure', async () => {
    const harness = createHarness({
      pull: vi.fn().mockResolvedValue({ success: false, error: 'Preview expired' }),
    });

    await expect(
      harness.state.executePull('project-1', 'docs/spec.md', 'pull-receipt'),
    ).resolves.toEqual({ success: false, error: 'Preview expired' });

    expect(harness.state.syncError).toBe('Preview expired');
    expect(harness.state.isSyncing).toBe(false);
  });
});
