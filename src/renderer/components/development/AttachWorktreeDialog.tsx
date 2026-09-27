/**
 * AttachWorktreeDialog — connect a worktree made outside KPM to a plan item,
 * so the task picks up that branch as if KPM had started it.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Repo } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { InlineAlert } from '../ui/InlineAlert';
import { SpinnerIcon } from '../icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { toast } from '../../stores/toastStore';
import { useDevSessionsStore } from '../../stores/devSessions';
import { attachWorktreeToPlanItem } from '../../services/devSessionService';
import { listRepoWorktrees } from '../../services/repoService';
import { getBaseName } from '../../utils/path';

interface AttachWorktreeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  planItemId: string;
  repos: Repo[];
  onAttached?: () => void;
}

interface WorktreeOption {
  path: string;
  branch: string;
}

const selectTriggerClass =
  'w-full flex items-center justify-between px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-accent transition-colors';

function ChevronIcon() {
  return (
    <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function AttachWorktreeDialog({
  isOpen,
  onClose,
  planItemId,
  repos,
  onAttached,
}: AttachWorktreeDialogProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id ?? '');
  const [worktrees, setWorktrees] = useState<WorktreeOption[] | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessions = useDevSessionsStore((state) => state.sessions);

  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);
  const attachedPaths = useMemo(
    () => new Set(sessions.map((session) => session.worktree_path).filter(Boolean)),
    [sessions],
  );

  useEffect(() => {
    if (!selectedRepo) return;
    let cancelled = false;
    setWorktrees(null);
    setSelectedPath('');
    listRepoWorktrees(selectedRepo.path)
      .then((all) => {
        if (cancelled) return;
        const options = all
          .filter((worktree) => !worktree.isMain && worktree.branch && !attachedPaths.has(worktree.path))
          .map((worktree) => ({ path: worktree.path, branch: worktree.branch! }));
        setWorktrees(options);
        setSelectedPath(options[0]?.path ?? '');
      })
      .catch(() => {
        if (!cancelled) setWorktrees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRepo, attachedPaths]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedRepo || !selectedPath) return;
    setIsAttaching(true);
    setError(null);
    try {
      const result = await attachWorktreeToPlanItem({
        planItemId,
        repoId: selectedRepo.id,
        worktreePath: selectedPath,
      });
      if (result.success) {
        toast.success(`Attached ${result.session.branch_name}`);
        onAttached?.();
        handleClose();
      } else {
        setError(result.error || 'Failed to attach worktree');
      }
    } catch {
      setError('Failed to attach worktree');
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm" preventClose={isAttaching}>
      <ModalHeader className="pt-5 pb-3" subtitle="Continue this task on a branch you started elsewhere">
        Attach Worktree
      </ModalHeader>

      <ModalBody className="py-4 space-y-3">
        {repos.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Repository</label>
            <Select value={selectedRepoId} onValueChange={setSelectedRepoId}>
              <SelectTrigger aria-label="Repository" className={selectTriggerClass}>
                <SelectValue />
                <ChevronIcon />
              </SelectTrigger>
              <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
                {repos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    <SelectItemText>{getBaseName(repo.path, repo.path)}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Worktree</label>
          {worktrees === null ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-2">
              <SpinnerIcon className="w-3 h-3 animate-spin" />
              Loading worktrees...
            </div>
          ) : worktrees.length === 0 ? (
            <p className="text-xs text-text-muted py-2">
              No unattached worktrees with a branch checked out. Create one with git worktree add, then reopen this.
            </p>
          ) : (
            <Select value={selectedPath} onValueChange={setSelectedPath}>
              <SelectTrigger aria-label="Worktree" className={selectTriggerClass}>
                <SelectValue />
                <ChevronIcon />
              </SelectTrigger>
              <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
                {worktrees.map((worktree) => (
                  <SelectItem key={worktree.path} value={worktree.path}>
                    <SelectItemText>
                      <span className="font-mono">{worktree.branch}</span>
                      <span className="ml-2 text-text-tertiary">{getBaseName(worktree.path, worktree.path)}</span>
                    </SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {error && (
          <InlineAlert variant="error" compact>{error}</InlineAlert>
        )}
      </ModalBody>

      <ModalFooter className="py-3">
        <MotionButton
          onClick={handleClose}
          disabled={isAttaching}
          className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary bg-surface-3/50 hover:bg-surface-3 rounded-md transition-colors"
        >
          Cancel
        </MotionButton>
        <MotionButton
          onClick={handleSubmit}
          disabled={isAttaching || !selectedPath}
          className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAttaching ? (
            <span className="flex items-center gap-1.5">
              <SpinnerIcon className="w-3 h-3 animate-spin" />
              Attaching...
            </span>
          ) : (
            'Attach'
          )}
        </MotionButton>
      </ModalFooter>
    </Modal>
  );
}
