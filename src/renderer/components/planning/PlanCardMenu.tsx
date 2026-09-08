import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  toast,
} from '../../stores';
import { useDevSessionsStore } from '../../stores/devSessions';
import { openDevSessionInEditor } from '../../services/devSessionService';
import { copyToClipboard } from '../../utils/clipboard';
import { DeleteWorktreeDialog } from './DeleteWorktreeDialog';
import { DropdownMenu, type DropdownPosition } from '../ui/DropdownMenu';
import { Modal, ModalBody } from '../ui/Modal';
import { trackerLabelFor } from '../tracker/shared/trackerDisplay';
import { OPENABLE_SESSION_STATUSES, type TrackerType, type DevSession } from '../../../shared/types';

// Stable empty-sessions ref. The Zustand selector below returns this when an
// item has no dev sessions; without a stable reference, `?? []` would create a
// fresh array on every render and `useSyncExternalStore` would treat each as a
// new snapshot — producing infinite re-renders.
const EMPTY_SESSIONS: DevSession[] = [];

interface PlanCardMenuProps {
  itemId: string;
  isOpen: boolean;
  position: DropdownPosition | null;
  onClose: () => void;
  onEditItem: () => void;
  onDelete: () => void;
  onAddToContext: () => void;
  onAddToTrackerQueue: () => Promise<void>;
  hasTrackerAssociation: boolean;
  trackerType: TrackerType | null;
  onLinkPr?: () => void;
  onStartAgent?: (itemId: string) => void;
  onOpenDetail?: (sessionId: string) => void;
}

export function PlanCardMenu({
  itemId,
  isOpen,
  position,
  onClose,
  onEditItem,
  onDelete,
  onAddToContext,
  onAddToTrackerQueue,
  hasTrackerAssociation,
  trackerType,
  onLinkPr,
  onStartAgent,
  onOpenDetail,
}: PlanCardMenuProps) {
  const {
    deleteDevSession,
    deletingSessionIds,
  } = useDevSessionsStore(
    useShallow((state) => ({
      deleteDevSession: state.deleteDevSession,
      deletingSessionIds: state.deletingSessionIds,
    }))
  );

  // Falls back to a session-recorded path when the worktree resource row has been
  // cleaned up (e.g. after PR merge) but the session still records its details.
  const itemSessions = useDevSessionsStore((state) => state.sessionsByPlanItemId.get(itemId) ?? EMPTY_SESSIONS);
  const { itemSession, openableSession, linkedPrSession, actionableSession } = useMemo(() => {
    const byRecency = [...itemSessions].sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
    const openable = byRecency.find((s) => OPENABLE_SESSION_STATUSES.includes(s.status));
    return {
      itemSession: byRecency[0],
      openableSession: openable,
      linkedPrSession: byRecency.find((s) => !!s.pr_url),
      actionableSession: openable ?? byRecency[0],
    };
  }, [itemSessions]);

  const targetWorktree = useMemo(() => {
    if (actionableSession?.worktree_path) {
      return {
        source: 'session' as const,
        id: actionableSession.id,
        plan_item_id: actionableSession.plan_item_id ?? itemId,
        project_id: actionableSession.project_id,
        worktree_path: actionableSession.worktree_path,
        branch_name: actionableSession.branch_name,
      };
    }

    return null;
  }, [actionableSession, itemId]);

  const copyWorktreePath = targetWorktree?.worktree_path ?? itemSession?.worktree_path ?? '';
  const copyBranchName = targetWorktree?.branch_name ?? itemSession?.branch_name ?? '';
  const canCopyWorktreeInfo = !!copyWorktreePath || !!copyBranchName;

  const [isOpeningEditor, setIsOpeningEditor] = useState(false);

  const openWorktreeInEditor = async () => {
    if (!targetWorktree) return;

    setIsOpeningEditor(true);
    try {
      const result = await openDevSessionInEditor({ sessionId: targetWorktree.id });
      if (!result.success) {
        throw new Error(result.error || 'Failed to open editor');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open editor');
    } finally {
      setIsOpeningEditor(false);
    }
  };
  const deleteWorktree = async (mode: 'cleanup' | 'destroy') => {
    if (!targetWorktree) return;

    const result = await deleteDevSession(targetWorktree.id, mode);
    if (!result.success) {
      throw new Error(result.error || `Failed to ${mode === 'cleanup' ? 'clean up' : 'destroy'} worktree`);
    }
  };
  const [showDeleteWorktreeConfirm, setShowDeleteWorktreeConfirm] = useState(false);
  const [showDestroyWorktreeConfirm, setShowDestroyWorktreeConfirm] = useState(false);
  const isWorktreeConfirmOpen = showDeleteWorktreeConfirm || showDestroyWorktreeConfirm;

  const isDeletingSessionWorktree = targetWorktree?.source === 'session' && deletingSessionIds.has(targetWorktree.id);
  const hasWorktree = !!targetWorktree;
  const isWorktreeLoading = isOpeningEditor || isDeletingSessionWorktree;
  const showWorktreeSection = hasWorktree || !!onStartAgent;
  const trackerLabel = trackerLabelFor(trackerType);

  const startAgentItem = onStartAgent && (
    <DropdownMenu.Item
      variant="accent"
      disabled={isWorktreeLoading}
      onClick={() => onStartAgent(itemId)}
      icon={
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      }
    >
      Start Agent
    </DropdownMenu.Item>
  );

  return (
    <>
      {/* The confirmation dialogs below are owned by this component, so the menu
          steps aside rather than closing — closing unmounts the whole thing. */}
      {!isWorktreeConfirmOpen && (
        <DropdownMenu
          isOpen={isOpen}
          onClose={onClose}
          position={position}
          className="max-w-[200px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
        >
          {onOpenDetail && openableSession && (
            <DropdownMenu.Item
              onClick={() => onOpenDetail(openableSession.id)}
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M15 3v18" />
                  <path d="m8 9 3 3-3 3" />
                </svg>
              }
            >
              Open details
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onClick={onEditItem}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
          >
            Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onClick={onAddToContext}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          >
            Add to Chat Context
          </DropdownMenu.Item>

          {showWorktreeSection && (
            <>
              <div className="px-2 py-1.5 flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
                <span className="text-xxs font-medium text-text-muted uppercase tracking-wider">Worktree</span>
                <div className="flex-1 h-px bg-gradient-to-r from-border-subtle via-transparent to-transparent" />
              </div>

              {startAgentItem}

              {hasWorktree && (
                <DropdownMenu.Item
                  closeOnClick={false}
                  disabled={isWorktreeLoading}
                  onClick={() => void openWorktreeInEditor()}
                  icon={
                    isOpeningEditor ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    )
                  }
                >
                  {isOpeningEditor ? 'Opening...' : 'Open in Editor'}
                </DropdownMenu.Item>
              )}
            </>
          )}

          {canCopyWorktreeInfo && (
            <>
              <DropdownMenu.Separator />
              {copyWorktreePath && (
                <DropdownMenu.Item
                  onClick={() => void copyToClipboard(`"${copyWorktreePath}"`, 'Worktree path')}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  }
                >
                  Copy worktree path
                </DropdownMenu.Item>
              )}
              {copyBranchName && (
                <DropdownMenu.Item
                  onClick={() => void copyToClipboard(copyBranchName, 'Branch name')}
                  title={copyBranchName}
                  className="font-mono text-xxs"
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12m0 0a3 3 0 100 6 3 3 0 000-6zm12-6a3 3 0 11-6 0 3 3 0 016 0zm0 0v2a4 4 0 01-4 4H9" />
                    </svg>
                  }
                >
                  {copyBranchName}
                </DropdownMenu.Item>
              )}
            </>
          )}

          <DropdownMenu.Separator />

          <DropdownMenu.Item
            onClick={() => onLinkPr?.()}
            title={
              linkedPrSession?.pr_number != null
                ? `Currently linked: PR #${linkedPrSession.pr_number}`
                : undefined
            }
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            }
          >
            {linkedPrSession ? 'Replace linked PR' : 'Link PR'}
          </DropdownMenu.Item>

          {hasTrackerAssociation && (
            <DropdownMenu.Item
              onClick={() => void onAddToTrackerQueue()}
              icon={
                <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              }
            >
              Queue for {trackerLabel}
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator />

          {hasWorktree && (
            <>
              <DropdownMenu.Item
                closeOnClick={false}
                disabled={isWorktreeLoading}
                title="Removes the worktree folder and local branch"
                onClick={() => setShowDeleteWorktreeConfirm(true)}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                }
              >
                Clean up worktree
              </DropdownMenu.Item>
              <DropdownMenu.Item
                variant="danger"
                closeOnClick={false}
                disabled={isWorktreeLoading}
                title="Permanently deletes worktree, branch, and remote branch"
                onClick={() => setShowDestroyWorktreeConfirm(true)}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              >
                Destroy worktree
              </DropdownMenu.Item>
            </>
          )}

          <DropdownMenu.Item
            variant="danger"
            onClick={onDelete}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            }
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu>
      )}

      {/* Delete worktree confirmation dialog */}
      {showDeleteWorktreeConfirm && targetWorktree && (
        <DeleteWorktreeDialog
          worktree={targetWorktree}
          isDeleting={isDeletingSessionWorktree}
          onConfirm={() => {
            const deletePromise = deleteWorktree('cleanup');
            setShowDeleteWorktreeConfirm(false);
            onClose();
            void deletePromise.catch((error) => {
              toast.error(error instanceof Error ? error.message : 'Failed to clean up worktree');
            });
          }}
          onCancel={() => {
            setShowDeleteWorktreeConfirm(false);
            onClose();
          }}
        />
      )}

      {/* Destroy worktree confirmation dialog */}
      {showDestroyWorktreeConfirm && targetWorktree && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowDestroyWorktreeConfirm(false);
            onClose();
          }}
          size="sm"
          preventClose={isDeletingSessionWorktree}
        >
          <ModalBody className="pb-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Destroy Worktree</h3>
                <p className="text-xs text-text-muted mt-0.5">This cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary mb-3 leading-relaxed">
              This will permanently delete:
            </p>
            <ul className="text-xs text-text-secondary space-y-1.5 ml-1">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-danger/60 flex-shrink-0" />
                The worktree directory and all its files
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-danger/60 flex-shrink-0" />
                The local branch <code className="text-xxs font-mono bg-surface-3 px-1 py-0.5 rounded">{targetWorktree.branch_name}</code>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-danger/60 flex-shrink-0" />
                The remote branch (if pushed)
              </li>
            </ul>
          </ModalBody>

          <div className="shrink-0 flex items-center gap-2 p-5">
            <button
              onClick={() => {
                setShowDestroyWorktreeConfirm(false);
                onClose();
              }}
              className="flex-1 px-3 py-2 text-xs font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors"
              disabled={isDeletingSessionWorktree}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const destroyPromise = deleteWorktree('destroy');
                setShowDestroyWorktreeConfirm(false);
                onClose();
                void destroyPromise.catch((error) => {
                  toast.error(error instanceof Error ? error.message : 'Failed to destroy worktree');
                });
              }}
              className="flex-1 px-3 py-2 text-xs font-medium text-white bg-danger hover:bg-danger/90 rounded-lg transition-colors"
              disabled={isDeletingSessionWorktree}
            >
              {isDeletingSessionWorktree ? 'Destroying...' : 'Destroy'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
