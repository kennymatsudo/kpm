import { isContextFile } from '../../../shared/contextFile';
import type { FileNode } from '../../../shared/types';
import { DropdownMenu } from '../ui';

interface FileContextMenuProps {
  x: number;
  y: number;
  path: string;
  node: FileNode;
  isFocused: boolean;
  onClose: () => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onToggleFocus: () => void;
  onRename: () => void;
  onOpenInEditor: () => void;
  onRevealInFinder: () => void;
  onCopyFullPath: () => void;
  onCopyRelativePath: () => void;
  onView?: () => void;
  onDelete: () => void;
  onLinkToConfluence?: () => void;
  onSyncConfluence?: () => void;
  onUnlinkFromConfluence?: () => void;
  isLinkedToConfluence?: boolean;
  onPublishToLinear?: () => void;
  onSyncLinear?: () => void;
  onUnlinkFromLinear?: () => void;
  isPublishedToLinear?: boolean;
  /** Whether each provider is set up for this project. */
  isLinearConfigured?: boolean;
  isConfluenceConfigured?: boolean;
}

export function FileContextMenu({
  x,
  y,
  path: _path,
  node,
  isFocused,
  onClose,
  onNewFile,
  onNewFolder,
  onToggleFocus,
  onRename,
  onOpenInEditor,
  onRevealInFinder,
  onCopyFullPath,
  onCopyRelativePath,
  onView,
  onDelete,
  onLinkToConfluence,
  onSyncConfluence,
  onUnlinkFromConfluence,
  isLinkedToConfluence,
  onPublishToLinear,
  onSyncLinear,
  onUnlinkFromLinear,
  isPublishedToLinear,
  isLinearConfigured,
  isConfluenceConfigured,
}: FileContextMenuProps) {
  const isProjectContextFile = isContextFile(node.name);
  const isMarkdown = node.name.endsWith('.md');

  // An already-published document keeps its entries even if that tracker was
  // since disconnected, otherwise it would be stranded with no way to unlink.
  const showLinear = isLinearConfigured || isPublishedToLinear;
  const showConfluence = isConfluenceConfigured || isLinkedToConfluence;

  return (
    <DropdownMenu
      isOpen={true}
      onClose={onClose}
      position={{ type: 'point', x, y }}
    >
      {/* New File / New Folder */}
      {(onNewFile || onNewFolder) && (
        <>
          {onNewFile && (
            <DropdownMenu.Item
              onClick={onNewFile}
              icon={
                <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              New File
            </DropdownMenu.Item>
          )}
          {onNewFolder && (
            <DropdownMenu.Item
              onClick={onNewFolder}
              icon={
                <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              }
            >
              New Folder
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator />
        </>
      )}

      {/* View/Edit action (for markdown files) */}
      {isMarkdown && onView && (
        <>
          <DropdownMenu.Item
            onClick={onView}
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            }
          >
            View / Edit
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
        </>
      )}

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
        {isFocused ? 'Remove from context' : 'Add to context'}
      </DropdownMenu.Item>

      {/* Publishing targets, grouped so a second provider does not stack another
          flat block above the file operations. */}
      {isMarkdown && (showLinear || showConfluence) && (
        <>
          <DropdownMenu.Separator />
          <DropdownMenu.Submenu
            trigger="Publish & sync"
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
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            }
          >
            {showLinear &&
              (isPublishedToLinear ? (
                <>
                  <DropdownMenu.SubmenuItem onClick={() => onSyncLinear?.()}>
                    Sync with Linear…
                  </DropdownMenu.SubmenuItem>
                  <DropdownMenu.SubmenuItem onClick={() => onUnlinkFromLinear?.()}>
                    Unlink from Linear
                  </DropdownMenu.SubmenuItem>
                </>
              ) : (
                <DropdownMenu.SubmenuItem onClick={() => onPublishToLinear?.()}>
                  Publish to Linear…
                </DropdownMenu.SubmenuItem>
              ))}

            {showLinear && showConfluence && <DropdownMenu.Separator />}

            {showConfluence &&
              (isLinkedToConfluence ? (
                <>
                  <DropdownMenu.SubmenuItem onClick={() => onSyncConfluence?.()}>
                    Sync with Confluence
                  </DropdownMenu.SubmenuItem>
                  <DropdownMenu.SubmenuItem onClick={() => onUnlinkFromConfluence?.()}>
                    Unlink from Confluence
                  </DropdownMenu.SubmenuItem>
                </>
              ) : (
                <DropdownMenu.SubmenuItem onClick={() => onLinkToConfluence?.()}>
                  Link to Confluence…
                </DropdownMenu.SubmenuItem>
              ))}
          </DropdownMenu.Submenu>
        </>
      )}

      <DropdownMenu.Separator />

      {/* Rename */}
      <DropdownMenu.Item
        onClick={onRename}
        disabled={isProjectContextFile}
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        }
      >
        Rename
      </DropdownMenu.Item>

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

      {/* Copy Full Path */}
      <DropdownMenu.Item
        onClick={onCopyFullPath}
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
        Copy Full Path
      </DropdownMenu.Item>

      {/* Copy Relative Path */}
      <DropdownMenu.Item
        onClick={onCopyRelativePath}
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
        Copy Relative Path
      </DropdownMenu.Item>

      <DropdownMenu.Separator />

      {/* Delete */}
      <DropdownMenu.Item
        variant="danger"
        onClick={onDelete}
        disabled={isProjectContextFile}
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
        Delete
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
