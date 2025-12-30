import type { Worktree } from '../../../shared/types';

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
          </div>
        </div>

        {/* Branch info card */}
          </div>
        </div>

        {/* Warning */}
        </div>

  );
}
