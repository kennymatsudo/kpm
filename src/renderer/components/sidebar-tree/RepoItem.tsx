import { memo, useCallback } from 'react';
import type { RepoEnvironmentMode } from '../../../shared/types';
import { RepoIcon, FocusIcon } from './FileIcon';
import { Tooltip } from '../ui/Tooltip';

interface RepoItemProps {
  id: string;
  name: string;
  path: string;
  branch?: string | null;
  environmentMode?: RepoEnvironmentMode;
  activeWorktreePath?: string | null;
  isFocused: boolean;
  onToggleFocus: (repoId: string) => void;
  onOpenMenu: (repoId: string, point: { x: number; y: number }) => void;
}

/**
 * Branch names treated as a repo's default when nothing better is known.
 *
 * The real answer is `resolveDefaultBranch` in `main/services/repo/branchFacts.ts`,
 * which asks git for `refs/remotes/origin/HEAD` and so gets a repo whose default
 * is `trunk` right too. No IPC endpoint exposes it to the renderer and `Repo`
 * carries no default-branch field, so this list is a guess: a repo whose default
 * is neither of these still wears a badge it doesn't need.
 */
const ASSUMED_DEFAULT_BRANCHES = new Set(['main', 'master']);

/** Three dots: the row's context menu, reachable without a right-click. */
function MoreActionsIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  );
}

/**
 * Repository row in the sidebar. Activating the row adds or removes the repo
 * from this chat's context; the trailing menu opens the same configuration
 * actions as a right-click.
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
  onOpenMenu,
}: RepoItemProps) {
  const hasEnvConfig = environmentMode && environmentMode !== 'auto' && environmentMode !== 'none';
  const isWorktreeActive = !!activeWorktreePath;
  // Sitting on the default branch is the resting state and says nothing, so it
  // gets no badge; a badge here means you are somewhere other than the default.
  const showBranch = !!branch && !ASSUMED_DEFAULT_BRANCHES.has(branch);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenMenu(id, { x: e.clientX, y: e.clientY });
    },
    [id, onOpenMenu]
  );

  // Anchored to the element rather than to the pointer, so a click and a
  // keyboard activation (which reports a 0,0 pointer) land the menu identically.
  const openMenuAtElement = useCallback(
    (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      onOpenMenu(id, { x: rect.right, y: rect.bottom });
    },
    [id, onOpenMenu]
  );

  const handleMenuButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      openMenuAtElement(e.currentTarget);
    },
    [openMenuAtElement]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Keys belonging to the buttons inside the row bubble up here too.
      if (e.target !== e.currentTarget) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggleFocus(id);
        return;
      }

      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        openMenuAtElement(e.currentTarget);
      }
    },
    [id, onToggleFocus, openMenuAtElement]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isFocused}
      aria-label={`${name} repository`}
      className="group flex min-h-8 items-center gap-2 py-1 px-3 mx-2 rounded-sm transition-colors duration-150 hover:bg-surface-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      title={isWorktreeActive
        ? `${path}\nActive worktree: ${activeWorktreePath}${branch ? `\nBranch: ${branch}` : ''}`
        : branch ? `${path}\nBranch: ${branch}` : path
      }
      onClick={() => onToggleFocus(id)}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      <RepoIcon />
      <span className="flex-1 min-w-0 text-sm text-text-secondary group-hover:text-text-primary transition-colors truncate">
        {name}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isWorktreeActive && (
          <Tooltip content={`Working in ${activeWorktreePath}`} side="top">
            <span className="text-tiny px-1.5 py-0.5 rounded-full bg-accent-muted text-accent font-mono">
              WT
            </span>
          </Tooltip>
        )}
        {hasEnvConfig && (
          <Tooltip content={`Environment: ${environmentMode}`} side="top">
            <span className="text-tiny px-1.5 py-0.5 rounded-full bg-surface-3 text-text-secondary font-mono">
              {environmentMode === 'direnv' ? 'env' : 'nix'}
            </span>
          </Tooltip>
        )}
        {showBranch && (
          <span
            className="text-tiny px-1.5 py-0.5 rounded-full bg-surface-3 text-text-secondary font-mono truncate max-w-[80px]"
            title={branch ?? undefined}
          >
            {branch}
          </span>
        )}
        <Tooltip content={isFocused ? 'Remove from context' : 'Add to context'} side="top">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFocus(id);
            }}
            aria-label={`${isFocused ? 'Remove from context' : 'Add to context'}: ${name}`}
            className={`
              w-5 h-5 flex items-center justify-center rounded-sm flex-shrink-0
              transition-[opacity,color,background-color] duration-150 hover:bg-surface-4
              ${isFocused
                ? 'text-accent'
                : 'text-text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-accent'
              }
            `}
          >
            <FocusIcon isFocused={isFocused} />
          </button>
        </Tooltip>
        <Tooltip content="More actions" side="top">
          <button
            onClick={handleMenuButtonClick}
            aria-haspopup="menu"
            aria-label={`More actions: ${name}`}
            className="w-5 h-5 flex items-center justify-center rounded-sm flex-shrink-0
              text-text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100
              transition-[opacity,color,background-color] duration-150 hover:bg-surface-4 hover:text-text-primary"
          >
            <MoreActionsIcon />
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
