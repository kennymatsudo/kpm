import { memo } from 'react';
import type { RepoEnvironmentMode } from '../../../shared/types';
import { RepoIcon, FocusIcon } from './FileIcon';

interface RepoItemProps {
  id: string;
  name: string;
  path: string;
  environmentMode?: RepoEnvironmentMode;
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
  environmentMode,
  isFocused,
  onToggleFocus,
  onContextMenu,
}: RepoItemProps) {
  const hasEnvConfig = environmentMode && environmentMode !== 'auto' && environmentMode !== 'none';

  return (
    <div
      onContextMenu={(e) => onContextMenu(e, id)}
    >
      <RepoIcon />
    </div>
  );
});
