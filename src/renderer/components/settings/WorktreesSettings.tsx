import { useState, useEffect, useCallback } from 'react';
import type { Worktree } from '../../../shared/types';
import { getWorktreesByProject, deleteWorktree, destroyWorktree } from '../../services/worktreeService';

interface Props {
  projectId: string;
}

interface ConfirmState {
  worktree: Worktree;
  mode: 'cleanup' | 'destroy';
}

export function WorktreesSettings({ projectId }: Props) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getWorktreesByProject({ projectId });
      setWorktrees(result);
    } catch {
      setError('Failed to load worktrees.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = async () => {
    if (!confirm) return;
    setActionId(confirm.worktree.id);
    try {
      const result =
        confirm.mode === 'destroy'
          ? await destroyWorktree({ worktreeId: confirm.worktree.id })
          : await deleteWorktree({ worktreeId: confirm.worktree.id });

      if (result.success) {
        setWorktrees((prev) => prev.filter((w) => w.id !== confirm.worktree.id));
      } else {
        setError(result.error ?? 'Operation failed.');
      }
    } finally {
      setActionId(null);
      setConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <svg className="w-5 h-5 animate-spin text-text-muted" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Git Worktrees</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Branches and folders agent sessions are working in.
          </p>
        </div>
        <button
          onClick={load}
          className="btn btn-secondary text-xs px-2 py-1"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger-muted/30 border border-danger/20 text-xs text-danger">
          {error}
        </div>
      )}

      {worktrees.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-text-muted">
          <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm">No worktrees for this project</span>
        </div>
      ) : (
        <div className="space-y-2">
          {worktrees.map((wt) => (
            <WorktreeRow
              key={wt.id}
              worktree={wt}
              isActing={actionId === wt.id}
              isConfirming={confirm?.worktree.id === wt.id}
              confirmMode={confirm?.worktree.id === wt.id ? confirm.mode : null}
              onCleanup={() => setConfirm({ worktree: wt, mode: 'cleanup' })}
              onDestroy={() => setConfirm({ worktree: wt, mode: 'destroy' })}
              onConfirm={handleConfirm}
              onCancelConfirm={() => setConfirm(null)}
            />
          ))}
        </div>
      )}

      {/* Confirm dialog overlay */}
      {confirm && (
        <ConfirmDialog
          worktree={confirm.worktree}
          mode={confirm.mode}
          isActing={actionId === confirm.worktree.id}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  worktree: Worktree;
  isActing: boolean;
  isConfirming: boolean;
  confirmMode: 'cleanup' | 'destroy' | null;
  onCleanup: () => void;
  onDestroy: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}

function WorktreeRow({ worktree, isActing, onCleanup, onDestroy }: RowProps) {
  const shortPath = worktree.worktree_path.replace(/^.*\/\.kpm-worktrees\//, '…/.kpm-worktrees/');
  const age = worktree.created_at ? formatAge(worktree.created_at) : null;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3/30 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01M16 7h.01M16 11h.01M16 15h.01M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
          </svg>
          <code className="text-xs font-mono text-text-primary truncate">{worktree.branch_name}</code>
        </div>
        <p className="text-xs text-text-muted truncate" title={worktree.worktree_path}>{shortPath}</p>
        {age && <p className="text-xs text-text-muted/70 mt-0.5">{age}</p>}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onCleanup}
          disabled={isActing}
          className="btn btn-secondary text-xs px-2 py-1 h-auto"
          title="Remove worktree folder and local branch"
        >
          {isActing ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : 'Clean up'}
        </button>
        <button
          onClick={onDestroy}
          disabled={isActing}
          className="btn btn-danger text-xs px-2 py-1 h-auto"
          title="Force-delete worktree, local branch, and remote branch"
        >
          Destroy
        </button>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  worktree: Worktree;
  mode: 'cleanup' | 'destroy';
  isActing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ worktree, mode, isActing, onConfirm, onCancel }: ConfirmDialogProps) {
  const isDestroy = mode === 'destroy';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-surface-elevated border border-border rounded-xl shadow-xl w-[400px] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {isDestroy ? 'Force destroy worktree?' : 'Clean up worktree?'}
          </h3>
          <p className="text-xs text-text-secondary mt-1">
            {isDestroy
              ? 'Force-deletes the worktree, local branch, and remote branch. This cannot be undone.'
              : 'Removes the worktree and its local branch. Uncommitted changes will be lost.'}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-surface-2 border border-border-subtle">
          <code className="text-xs font-mono text-text-primary break-all">{worktree.branch_name}</code>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={isActing} className="btn btn-secondary text-sm">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isActing}
            className={isDestroy ? 'btn btn-danger text-sm' : 'btn btn-secondary text-sm'}
          >
            {isActing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : isDestroy ? 'Force Destroy' : 'Clean Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAge(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'created today';
  if (days === 1) return 'created yesterday';
  if (days < 30) return `created ${days}d ago`;
  const months = Math.floor(days / 30);
  return `created ${months}mo ago`;
}
