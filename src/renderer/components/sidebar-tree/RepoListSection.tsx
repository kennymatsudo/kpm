import { memo } from 'react';
import { SidebarSection } from './SidebarSection';
import { RepoItem } from './RepoItem';
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
  onRepoContextMenu: (e: React.MouseEvent, repoId: string) => void;
}

export const RepoListSection = memo(function RepoListSection({
  repos,
  repoBranches,
  isCollapsed,
  onToggleCollapsed,
  onAddRepo,
  isRepoFocused,
  onToggleRepoFocus,
  onRepoContextMenu,
}: RepoListSectionProps) {
  return (
    <SidebarSection
      title="Repositories"
      isCollapsed={isCollapsed}
      onToggleCollapsed={onToggleCollapsed}
      className="flex-none"
      action={
        <button
          onClick={onAddRepo}
          className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
          title="Add repository"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      }
    >
      <div className="max-h-56 overflow-y-auto pb-1" style={{ scrollbarGutter: 'stable' }}>
        {repos.length === 0 ? (
          <div className="px-3 py-2 mx-2">
            <p className="text-xs text-text-muted">No repositories connected</p>
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
              onContextMenu={onRepoContextMenu}
            />
          ))
        )}
      </div>
    </SidebarSection>
  );
});
