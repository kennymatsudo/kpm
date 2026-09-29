import type { BoardChange } from '../../../shared/boardChanges';
import { getBaseName } from '../../utils/path';

interface PendingBoardChangePanelProps {
  change: BoardChange;
  error?: string;
  onApprove: () => void;
  onDismiss: () => void;
  isApplying?: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xxs uppercase tracking-wide text-text-muted mb-1">{label}</div>
      <div className="text-sm text-text-primary break-all">{children}</div>
    </div>
  );
}

/** Approve-or-dismiss view of a chat-proposed worktree attach or PR link. */
export function PendingBoardChangePanel({ change, error, onApprove, onDismiss, isApplying = false }: PendingBoardChangePanelProps) {
  const isAttach = change.kind === 'attach_worktree';

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="text-sm font-semibold text-text-primary">
            {isAttach ? 'Attach worktree' : change.replacesPrNumber ? 'Replace linked pull request' : 'Link pull request'}
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            {isAttach
              ? 'The task gets a board session on this branch. Deleting the session later removes this worktree folder but keeps the branch.'
              : 'The task tracks this pull request\'s state and reviews.'}
          </div>
        </div>
        {error && <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-3">
          <Field label="Task">{change.itemTitle}</Field>
          <Field label="Repository">{getBaseName(change.repoPath, change.repoPath)}</Field>
          {change.kind === 'attach_worktree' ? (
            <>
              <Field label="Worktree"><code>{change.worktreePath}</code></Field>
              <Field label="Branch"><code>{change.branchName}</code></Field>
              {change.carriedPrNumber && <Field label="Linked pull request">#{change.carriedPrNumber} moves onto this session</Field>}
            </>
          ) : (
            <>
              <Field label="Pull request">
                #{change.prNumber}{change.prTitle ? ` ${change.prTitle}` : ''}
              </Field>
              {change.prHeadBranch && <Field label="Branch"><code>{change.prHeadBranch}</code></Field>}
              {change.replacesPrNumber && <Field label="Replaces">#{change.replacesPrNumber}</Field>}
            </>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onDismiss}
          disabled={isApplying}
          className="px-3 py-1.5 text-sm rounded border border-border-subtle text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={isApplying}
          className="px-3 py-1.5 text-sm rounded bg-accent text-text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {isApplying ? (isAttach ? 'Attaching…' : 'Linking…') : isAttach ? 'Attach' : 'Link'}
        </button>
      </div>
    </div>
  );
}
