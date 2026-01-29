import type { Worktree } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';

interface DeleteWorktreeDialogProps {
  worktree: Worktree;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteWorktreeDialog({
  worktree,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteWorktreeDialogProps) {
  return (
    <Modal isOpen={true} onClose={onCancel} size="sm" preventClose={isDeleting}>
      <ModalHeader onClose={onCancel}>
        <div className="flex items-start gap-4">
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-secondary">
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Branch info card */}
        <div className="p-3 rounded-lg bg-surface-2 border border-border-subtle mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Branch</span>
          </div>
          <code className="text-sm font-mono text-text-primary break-all">{worktree.branch_name}</code>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-muted/50">
          <svg className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-text-secondary">
          </p>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={isDeleting}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="btn btn-danger"
          disabled={isDeleting}
        >
          {isDeleting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            </svg>
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}
