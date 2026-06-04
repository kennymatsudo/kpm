import { DropdownMenu } from '../ui';
import { copyToClipboard } from '../../utils/clipboard';

export interface RepoWorktree {
  path: string;
  branch: string | null;
  isMain: boolean;
}

interface RepoContextMenuProps {
  x: number;
  y: number;
  repoId: string;
  repoPath: string;
  activeWorktreePath: string | null | undefined;
  worktrees: RepoWorktree[];
  isFocused: boolean;
  onClose: () => void;
  onToggleFocus: () => void;
  onRemove: () => void;
  onRevealInFinder: () => void;
  onOpenInEditor: () => void;
  onSetActiveWorktreePath: (path: string | null) => void;
}

export function RepoContextMenu({
  x,
  y,
  repoId: _repoId,
  repoPath,
  activeWorktreePath,
  worktrees,
  isFocused,
  onClose,
  onToggleFocus,
  onRemove,
  onRevealInFinder,
  onOpenInEditor,
  onSetActiveWorktreePath,
}: RepoContextMenuProps) {

  const handleWorktreeSelect = (path: string | null) => {
    onSetActiveWorktreePath(path);
    onClose();
  };

  return (
    <DropdownMenu
      isOpen={true}
      onClose={onClose}
      position={{ type: 'point', x, y }}
      minWidth={180}
    >
      {/* Focus action */}
      <DropdownMenu.Item
        onClick={() => {
          onToggleFocus();
          onClose();
        }}
        closeOnClick={false}
        variant={isFocused ? 'accent' : 'default'}
        icon={
          <svg
            className={`w-4 h-4 ${isFocused ? 'text-accent' : 'text-text-tertiary'}`}
            fill={isFocused ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        }
      >
        {isFocused ? 'Remove from this chat' : 'Add to this chat'}
      </DropdownMenu.Item>

      <DropdownMenu.Separator />

      {/* Switch worktree submenu */}
      <DropdownMenu.Submenu
        trigger="Switch worktree"
        icon={
          <svg
            className="w-4 h-4 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        }
        minWidth={240}
      >
        <DropdownMenu.SubmenuItem
          onClick={() => handleWorktreeSelect(null)}
          selected={!activeWorktreePath}
        >
          <span className="flex items-center gap-2">
            {!activeWorktreePath ? (
              <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            ) : (
              <span className="w-4" />
            )}
            <span className="flex flex-col items-start">
              <span className="text-sm">Main checkout</span>
              <span className="text-tiny text-text-muted font-mono truncate max-w-[180px]">{repoPath}</span>
            </span>
          </span>
        </DropdownMenu.SubmenuItem>
        {worktrees.filter((wt) => !wt.isMain).map((wt) => (
          <DropdownMenu.SubmenuItem
            key={wt.path}
            onClick={() => handleWorktreeSelect(wt.path)}
            selected={activeWorktreePath === wt.path}
          >
            <span className="flex items-center gap-2">
              {activeWorktreePath === wt.path ? (
                <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <span className="w-4" />
              )}
              <span className="flex flex-col items-start">
                <span className="text-sm font-mono">{wt.branch ?? '(detached)'}</span>
                <span className="text-tiny text-text-muted font-mono truncate max-w-[180px]">{wt.path}</span>
              </span>
            </span>
          </DropdownMenu.SubmenuItem>
        ))}
        {worktrees.filter((wt) => !wt.isMain).length === 0 && (
          <DropdownMenu.SubmenuItem selected={false}>
            <span className="text-sm text-text-muted italic">No worktrees found</span>
          </DropdownMenu.SubmenuItem>
        )}
      </DropdownMenu.Submenu>


      <DropdownMenu.Separator />

      {/* Open in Editor */}
      <DropdownMenu.Item
        onClick={onOpenInEditor}
        icon={
          <svg
            className="w-4 h-4 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17.25 6.75L21 12l-3.75 5.25M6.75 6.75L3 12l3.75 5.25M14 4l-4 16"
            />
          </svg>
        }
      >
        Open in Editor
      </DropdownMenu.Item>

      {/* Reveal in Finder */}
      <DropdownMenu.Item
        onClick={onRevealInFinder}
        icon={
          <svg
            className="w-4 h-4 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        }
      >
        Reveal in Finder
      </DropdownMenu.Item>

      {/* Copy Path */}
      <DropdownMenu.Item
        onClick={() => {
          void copyToClipboard(`"${activeWorktreePath ?? repoPath}"`, 'Path');
          onClose();
        }}
        closeOnClick={false}
        icon={
          <svg
            className="w-4 h-4 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
        }
      >
        Copy Path
      </DropdownMenu.Item>

      <DropdownMenu.Separator />

      {/* Remove */}
      <DropdownMenu.Item
        variant="danger"
        onClick={onRemove}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        }
      >
        Remove Repository
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
