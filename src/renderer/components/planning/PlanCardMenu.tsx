import { createPortal } from 'react-dom';
import { DeleteWorktreeDialog } from './DeleteWorktreeDialog';

interface PlanCardMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onEditItem: () => void;
  onDelete: () => void;
}

export function PlanCardMenu({
  isOpen,
  position,
  onClose,
  onEditItem,
  onDelete,
}: PlanCardMenuProps) {
  const [showDeleteWorktreeConfirm, setShowDeleteWorktreeConfirm] = useState(false);




  return (
    <>
        <div
          ref={menuRef}
          style={{
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
    </>
  );
}
