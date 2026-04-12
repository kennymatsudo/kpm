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
      title={isWorktreeActive
        ? `${path}\nActive worktree: ${activeWorktreePath}${branch ? `\nBranch: ${branch}` : ''}`
        : branch ? `${path}\nBranch: ${branch}` : path
      }
      onContextMenu={(e) => onContextMenu(e, id)}
    >
      <RepoIcon />
        {branch && (
          <span
            title={branch}
          >
            {branch}
          </span>
        )}
    </div>
  );
});
