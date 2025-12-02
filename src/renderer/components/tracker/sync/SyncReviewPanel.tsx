import { SyncConflictCard } from './SyncConflictCard';
import { SyncDeletedSection } from './SyncDeletedSection';
import { SyncErrorBanner } from './SyncErrorBanner';
import { SyncReviewSkeleton } from './SyncSkeleton';

interface Props {
  projectId: string;
  onClose: () => void;
  onSyncComplete: () => void;
}

export function SyncReviewPanel({ projectId, onClose, onSyncComplete }: Props) {
  const {
    syncPreview,
    syncProgress,
    isSyncing,
    resolutions,
    deletedAction,
    deletedDecisions,
    setResolution,
    setDeletedAction,
    setDeletedDecision,
    applySync,
    discardSync,

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
              </p>
            </div>
    );
  }

  // Show error state
  if (syncError && !syncPreview) {
    return (
            </div>
          </div>
        </div>
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



            </div>

                      </span>
                  </div>



          />

          )}
        </div>
            <button
            >
            </button>
        </div>
  );
}
