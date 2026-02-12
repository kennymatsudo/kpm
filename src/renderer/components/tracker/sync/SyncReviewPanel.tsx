import { useSyncStore } from '../../../stores';
import { SyncConflictCard } from './SyncConflictCard';
import { SyncDeletedSection } from './SyncDeletedSection';
import { SyncErrorBanner } from './SyncErrorBanner';
import { SyncReviewSkeleton } from './SyncSkeleton';
import { SyncUpdateCard } from './SyncUpdateCard';
import { Modal, ModalHeader, ModalFooter } from '../../ui/Modal';
import { LoadingSpinner } from '../../ui/LoadingButton';
import { Z_INDEX } from '../../../constants/zIndex';

interface Props {
  projectId: string;
  onClose: () => void;
  onSyncComplete: () => void;
}

export function SyncReviewPanel({ projectId, onClose, onSyncComplete }: Props) {
  const {
    syncPreview,
    syncProgress,
    error: syncError,
    isSyncing,
    resolutions,
    deletedAction,
    deletedDecisions,
    setResolution,
    setDeletedAction,
    setDeletedDecision,
    applySync,
    discardSync,
  } = useSyncStore();

  const handleClose = () => {
    discardSync();
    onClose();
  };

  const handleApply = async () => {
    const result = await applySync(projectId);
    if (result) {
      onSyncComplete();
    }
  };

  // Show loading state while fetching preview
  if (isSyncing && !syncPreview) {
    const isFetching = syncProgress?.phase === 'fetching';
    const isAnalyzing = syncProgress?.phase === 'analyzing';

    return (
      <Modal
        isOpen={true}
        onClose={handleClose}
        size={isAnalyzing ? '2xl' : 'lg'}
        className={isAnalyzing ? 'flex flex-col max-h-[80vh]' : ''}
        zIndex={Z_INDEX.panel}
      >
        {isAnalyzing ? (
          // Show skeleton layout during analyzing phase
          <>
            <ModalHeader onClose={handleClose} className="flex-col items-start">
              <span>Review Changes</span>
              <p className="text-text-muted text-sm mt-1 font-normal">
                Analyzing changes... {syncProgress.current}/{syncProgress.total}
              </p>
            </ModalHeader>
            <div className="flex-1 overflow-y-auto p-5">
              <SyncReviewSkeleton />
            </div>
          </>
        ) : (
          // Show simple spinner during fetching
          <div className="p-8 flex flex-col items-center">
            <LoadingSpinner className="w-8 h-8 mb-4" color="accent" />
            <p className="text-text-primary text-sm">
              {isFetching
                ? `Fetching issues... ${syncProgress?.current ?? 0}`
                : 'Syncing...'}
            </p>
          </div>
        )}
      </Modal>
    );
  }

  // Show error state
  if (syncError && !syncPreview) {
    return (
      <Modal isOpen={true} onClose={handleClose} size="lg" zIndex={Z_INDEX.panel}>
        <div className="p-5">
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-xl bg-danger-muted flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-text-primary font-medium mb-2">Sync failed</h3>
            <p className="text-text-muted text-sm mb-4">{syncError}</p>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm bg-surface-3 text-text-primary rounded-lg hover:bg-surface-3/80 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!syncPreview) return null;

  const { stats, new_items, updated_items, conflicts, deleted_in_tracker } = syncPreview;

  // Check if everything is up to date
  const isUpToDate = stats.new === 0 && stats.updated === 0 && stats.conflicts === 0 && stats.deleted === 0;

  // Check if all conflicts are resolved
  const unresolvedConflicts = conflicts.filter(c => !resolutions[c.plan_item_id]);

  // Check if all deleted decisions are made (when action is 'decide_each')
  const pendingDeletedDecisions = deletedAction === 'decide_each'
    ? deleted_in_tracker.filter(item => !deletedDecisions[item.id])
    : [];

  const canApply = unresolvedConflicts.length === 0 && pendingDeletedDecisions.length === 0;

  // Calculate total items that will be modified
  const totalChanges = stats.new + stats.updated + conflicts.length + (
    deletedAction === 'delete' ? deleted_in_tracker.length :
    deletedAction === 'decide_each' ? Object.values(deletedDecisions).filter(d => d === 'delete').length :
    0
  );

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      size="2xl"
      className="flex flex-col max-h-[80vh]"
      zIndex={Z_INDEX.panel}
      preventClose={isSyncing}
      aria-labelledby="sync-review-title"
    >
      {/* Header */}
      <ModalHeader id="sync-review-title" onClose={handleClose} className="flex-col items-start">
        <span>Review Changes</span>
        <p className="text-text-muted text-sm mt-1 font-normal">
          {stats.new} new, {stats.updated} updated, {stats.conflicts} conflicts, {stats.deleted} removed
        </p>
      </ModalHeader>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Up to date state */}
        {isUpToDate && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-xl bg-success-muted flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-text-primary font-medium mb-1">Everything up to date</h3>
            <p className="text-text-muted text-sm">No changes found since last sync.</p>
          </div>
        )}

        {/* New Items */}
        {new_items.length > 0 && (
          <section>
            <h3 className="font-medium text-sm mb-2 flex items-center gap-2 text-text-primary">
              <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New Items ({new_items.length})
            </h3>
            <div className="space-y-2">
              {new_items.map(item => (
                <div key={item.external_key} className="p-3 bg-surface-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 bg-surface-3 rounded text-text-muted font-mono">
                      {item.external_key}
                    </span>
                    {item.external_issue_type && (
                      <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                        {item.external_issue_type}
                      </span>
                    )}
                    <span className="font-medium text-sm text-text-primary truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                    {item.external_status && (
                      <span>Status: <span className="text-text-secondary">{item.external_status}</span></span>
                    )}
                    {item.external_parent_key && (
                      <span>Parent: <span className="text-text-secondary">{item.external_parent_key}</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Updates (auto-applied) */}
        {updated_items.length > 0 && (
          <section>
            <h3 className="font-medium text-sm mb-2 flex items-center gap-2 text-text-primary">
              <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Updates ({updated_items.length})
            </h3>
            <div className="space-y-2">
              {updated_items.map(item => (
                <SyncUpdateCard key={item.plan_item_id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Conflicts */}
        {conflicts.length > 0 && (
          <section>
            <h3 className="font-medium text-sm mb-2 flex items-center gap-2 text-text-primary">
              <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Conflicts ({conflicts.length})
              {unresolvedConflicts.length > 0 && (
                <span className="text-xs text-warning ml-1">
                  ({unresolvedConflicts.length} unresolved)
                </span>
              )}
            </h3>
            <div className="space-y-3">
              {conflicts.map((conflict, idx) => (
                <SyncConflictCard
                  key={conflict.plan_item_id}
                  conflict={conflict}
                  resolution={resolutions[conflict.plan_item_id]}
                  onResolve={(r) => setResolution(conflict.plan_item_id, r)}
                  index={idx}
                  total={conflicts.length}
                />
              ))}
            </div>
          </section>
        )}

        {/* Deleted Items */}
        <SyncDeletedSection
          items={deleted_in_tracker}
          action={deletedAction}
          decisions={deletedDecisions}
          onActionChange={setDeletedAction}
          onDecisionChange={setDeletedDecision}
        />

        {syncError && (
          <SyncErrorBanner
            error={syncError}
            variant="inline"
            onDismiss={() => useSyncStore.getState().clearError()}
          />
        )}
      </div>

      {/* Footer */}
      <ModalFooter className="justify-between">
        <div className="text-text-muted text-sm">
          {!isUpToDate && unresolvedConflicts.length > 0 && (
            <span className="text-warning">Resolve all conflicts to continue</span>
          )}
          {!isUpToDate && unresolvedConflicts.length === 0 && pendingDeletedDecisions.length > 0 && (
            <span className="text-warning">Decide action for all deleted items</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-text-primary hover:bg-surface-3 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {!isUpToDate && (
            <button
              onClick={handleApply}
              disabled={!canApply || isSyncing}
              className={`btn btn-primary ${isSyncing ? 'animate-pulse' : ''}`}
            >
              {isSyncing ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" color="white" />
                  Applying {totalChanges} items...
                </span>
              ) : (
                `Apply ${totalChanges} Changes`
              )}
            </button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}
