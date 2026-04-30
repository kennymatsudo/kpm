import { memo } from 'react';
import type { RepoEnvironmentMode } from '../../../shared/types';
import { RepoIcon, FocusIcon } from './FileIcon';

interface RepoItemProps {
  id: string;
  name: string;
  path: string;
  branch?: string | null;
  environmentMode?: RepoEnvironmentMode;
  activeWorktreePath?: string | null;
  isFocused: boolean;
  onToggleFocus: (repoId: string) => void;
  onContextMenu: (e: React.MouseEvent, repoId: string) => void;
}

/**
 * Repository item in the sidebar with explicit focus toggle.
 * Click the bookmark button to add/remove from this chat's context.
 * Right-click to open context menu for configuration.
 */
export const RepoItem = memo(function RepoItem({
  id,
  name,
  path,
  branch,
  environmentMode,
  activeWorktreePath,
  isFocused,
  onToggleFocus,
  onContextMenu,
}: RepoItemProps) {
  const hasEnvConfig = environmentMode && environmentMode !== 'auto' && environmentMode !== 'none';
  const isWorktreeActive = !!activeWorktreePath;

  return (
    <div
      className="group flex items-center gap-2 py-1 px-3 mx-1 rounded-md transition-all duration-150 hover:bg-surface-2/60 cursor-default"
      title={isWorktreeActive
        ? `${path}\nActive worktree: ${activeWorktreePath}${branch ? `\nBranch: ${branch}` : ''}`
        : branch ? `${path}\nBranch: ${branch}` : path
      }
      onContextMenu={(e) => onContextMenu(e, id)}
    >
      <RepoIcon />
      <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{name}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isWorktreeActive && (
          <span
            className="text-xxs px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono"
            title={`Worktree: ${activeWorktreePath}`}
          >
            WT
          </span>
        )}
        {hasEnvConfig && (
          <span
            className="text-xxs px-1.5 py-0.5 rounded bg-surface-3 text-text-muted font-mono"
            title={`Environment: ${environmentMode}`}
          >
            {environmentMode === 'direnv' ? 'env' : 'nix'}
          </span>
        )}
        {branch && (
          <span
            className="text-xxs px-1.5 py-0.5 rounded bg-surface-3 text-text-muted font-mono truncate max-w-[64px]"
            title={branch}
          >
            {branch}
          </span>
        )}
      </div>
    </div>
  );
});
