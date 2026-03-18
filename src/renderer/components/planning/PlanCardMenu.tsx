import { createPortal } from 'react-dom';
import { DeleteWorktreeDialog } from './DeleteWorktreeDialog';
import { Z_INDEX } from '../../constants/zIndex';

interface PlanCardMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onEditItem: () => void;
  onDelete: () => void;
  onAddToContext: () => void;
}

export function PlanCardMenu({
  isOpen,
  position,
  onClose,
  onEditItem,
  onDelete,
  onAddToContext,
}: PlanCardMenuProps) {
  const [showDeleteWorktreeConfirm, setShowDeleteWorktreeConfirm] = useState(false);
  const [showDestroyWorktreeConfirm, setShowDestroyWorktreeConfirm] = useState(false);



      onClose();

  if (!isOpen && !position) return null;

  return (
    <>
        <div
          ref={menuRef}
          className="dropdown-menu fixed max-w-[200px] max-h-[calc(100vh-32px)] overflow-y-auto"
          style={{
            zIndex: Z_INDEX.dropdown,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditItem();
              onClose();
            }}
            className="dropdown-item w-full flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToContext();
              onClose();
            }}
            className="dropdown-item w-full flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Add to Chat Context
          </button>

            <>
              </div>

                    <button
                        e.stopPropagation();
                      }}
                    >
                      </svg>
                    </button>
              )}
          )}

          <div className="dropdown-separator" />

            <button
              onClick={async (e) => {
                e.stopPropagation();
                onClose();
              }}
              className="dropdown-item w-full flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onDelete();
            }}
            className="dropdown-item dropdown-item-danger w-full flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>,
        document.body
      )}

      {/* Delete worktree confirmation dialog */}
        <DeleteWorktreeDialog
            setShowDeleteWorktreeConfirm(false);
          }}
        />
      )}

      {/* Destroy worktree confirmation dialog */}
          <div className="p-5">
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
            <ul className="text-xs text-text-secondary mb-4 space-y-1.5 ml-1">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-danger/60 flex-shrink-0" />
                The worktree directory and all its files
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-danger/60 flex-shrink-0" />
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-danger/60 flex-shrink-0" />
                The remote branch (if pushed)
              </li>
            </ul>

            <div className="flex items-center gap-2">
              <button
                className="flex-1 px-3 py-2 text-xs font-medium text-text-secondary bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                }}
                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-danger hover:bg-danger/90 rounded-lg transition-colors"
              >
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
