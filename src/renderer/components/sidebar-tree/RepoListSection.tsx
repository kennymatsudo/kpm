import { memo } from 'react';
import { SidebarSection } from './SidebarSection';
import { RepoItem } from './RepoItem';
import { GitBranchIcon, PlusIcon } from '../icons';
import { getBaseName } from '../../utils/path';
import type { RepoEnvironmentMode } from '../../../shared/types';

interface RepoListSectionProps {
  repos: {
    id: string;
    path: string;
    environment_mode?: RepoEnvironmentMode;
    active_worktree_path?: string | null;
  }[];
  repoBranches: Record<string, string | null | undefined>;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onAddRepo: () => void;
  isRepoFocused: (repoId: string) => boolean;
  onToggleRepoFocus: (repoId: string) => void;
  onOpenRepoMenu: (repoId: string, point: { x: number; y: number }) => void;
}

export const RepoListSection = memo(function RepoListSection({
  repos,
  repoBranches,
  isCollapsed,
  onToggleCollapsed,
  onAddRepo,
  isRepoFocused,
  onToggleRepoFocus,
  onOpenRepoMenu,
}: RepoListSectionProps) {
  return (
    <SidebarSection
      title="Repositories"
      icon={<GitBranchIcon className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />}
      isCollapsed={isCollapsed}
      onToggleCollapsed={onToggleCollapsed}
      className="flex-none"
      action={
        <button
          onClick={onAddRepo}
          className="p-1.5 rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          title="Add repository"
          aria-label="Add repository"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="max-h-56 overflow-y-auto pb-1" style={{ scrollbarGutter: 'stable' }}>
        {repos.length === 0 ? (
          <div className="px-3 py-2 mx-2">
            <p className="text-xs text-text-muted leading-relaxed">
              No repositories connected. Add the codebases you want to read and change.
            </p>
          </div>
        ) : (
          repos.map((repo) => (
            <RepoItem
              key={repo.id}
              id={repo.id}
              name={getBaseName(repo.path, 'Repository')}
              path={repo.path}
              branch={repoBranches[repo.id]}
              environmentMode={repo.environment_mode}
              activeWorktreePath={repo.active_worktree_path}
              isFocused={isRepoFocused(repo.id)}
              onToggleFocus={onToggleRepoFocus}
              onOpenMenu={onOpenRepoMenu}
            />
          ))
        )}
      </div>
    </SidebarSection>
  );
});
