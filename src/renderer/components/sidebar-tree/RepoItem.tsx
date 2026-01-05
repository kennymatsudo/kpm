import { memo } from 'react';
import { RepoIcon, FocusIcon } from './FileIcon';

interface RepoItemProps {
  id: string;
  name: string;
  path: string;
  isFocused: boolean;
  onToggleFocus: (repoId: string) => void;
}

/**
 */
export const RepoItem = memo(function RepoItem({
  id,
  name,
  path,
  isFocused,
  onToggleFocus,
}: RepoItemProps) {
  return (
    <div
    >
      <RepoIcon />
    </div>
  );
});
