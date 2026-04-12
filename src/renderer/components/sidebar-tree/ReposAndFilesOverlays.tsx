import type { RefObject } from 'react';
import { isContextFile } from '../../../shared/contextFile';
import type { RepoWorktree } from './RepoContextMenu';
import { DropdownMenu } from '../ui/DropdownMenu';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { MarkdownDocumentModal } from '../markdown-document-modal';
import { ImageViewerModal } from '../image-viewer-modal';
import { LinkToConfluenceModal, ConfluenceSyncPreviewModal } from '../confluence';
import { FileContextMenu } from './FileContextMenu';
import { RepoContextMenu } from './RepoContextMenu';

interface CreateItemMenuProps {
  onStartCreate: (type: 'file' | 'folder') => void;
}

function CreateItemMenuItems({ onStartCreate }: CreateItemMenuProps) {
  return (
    <>
      <DropdownMenu.Item
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        }
        onClick={() => onStartCreate('file')}
      >
        New File
      </DropdownMenu.Item>
      <DropdownMenu.Item
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        }
        onClick={() => onStartCreate('folder')}
      >
        New Folder
      </DropdownMenu.Item>
    </>
  );
}

interface ReposAndFilesOverlaysProps {
  projectId: string;
  addMenuAnchorRef: RefObject<HTMLButtonElement | null>;
  isAddMenuOpen: boolean;
  onCloseAddMenu: () => void;
  onStartCreate: (type: 'file' | 'folder') => void;
  emptySpaceMenu: { x: number; y: number } | null;
  onCloseEmptySpaceMenu: () => void;
  fileContextMenu: { x: number; y: number; path: string } | null;
  contextNode: FileNode | null;
  isContextPathFocused: boolean;
  onCloseFileContextMenu: () => void;
  onToggleContextFileFocus: () => void;
  onRenameContextFile: () => void;
  onRevealContextFileInFinder: () => void;
  onCopyContextFullPath: () => void;
  onCopyContextRelativePath: () => void;
  onViewContextFile?: () => void;
  onDeleteContextFile: () => void;
  onLinkToConfluence: () => void;
  onSyncConfluence: () => void;
  onUnlinkFromConfluence: () => void;
  isContextFileLinkedToConfluence: boolean;
  repoContextMenu: { x: number; y: number; repoId: string } | null;
  repoContextRepo: {
    id: string;
    path: string;
    active_worktree_path?: string | null;
  } | null;
  repoWorktrees: RepoWorktree[];
  isRepoFocused: boolean;
  onCloseRepoContextMenu: () => void;
  onToggleRepoFocus: () => void;
  onRemoveRepo: () => void;
  onRevealRepoInFinder: () => void;
  onSetActiveWorktreePath: (path: string | null) => void;
  deleteConfirmPath: string | null;
  deleteNode: FileNode | null;
  deleteFilename: string;
  onCancelDelete: () => void;
  onConfirmDelete: () => void | Promise<void>;
  unlinkConfirmPath: string | null;
  onCancelUnlink: () => void;
  onConfirmUnlink: () => void | Promise<void>;
  viewingPath: string | null;
  viewingFilename: string;
  viewingContent: string;
  onCloseViewer: () => void;
  onSaveMarkdown: (content: string) => void | Promise<void>;
  viewingImage: {
    filename: string;
    dataUrl: string;
    size: number;
  } | null;
  onCloseImageViewer: () => void;
  confluenceLinkPath: string | null;
  onCloseLinkModal: () => void;
  linkDocumentTitle: string;
  syncConfluenceLink: ConfluencePageLink | null;
  confluenceSyncPath: string | null;
  onCloseSyncModal: () => void;
  onConfluenceContentUpdated: () => void;
}

export function ReposAndFilesOverlays({
  projectId,
  addMenuAnchorRef,
  isAddMenuOpen,
  onCloseAddMenu,
  onStartCreate,
  emptySpaceMenu,
  onCloseEmptySpaceMenu,
  fileContextMenu,
  contextNode,
  isContextPathFocused,
  onCloseFileContextMenu,
  onToggleContextFileFocus,
  onRenameContextFile,
  onRevealContextFileInFinder,
  onCopyContextFullPath,
  onCopyContextRelativePath,
  onViewContextFile,
  onDeleteContextFile,
  onLinkToConfluence,
  onSyncConfluence,
  onUnlinkFromConfluence,
  isContextFileLinkedToConfluence,
  repoContextMenu,
  repoContextRepo,
  repoWorktrees,
  isRepoFocused,
  onCloseRepoContextMenu,
  onToggleRepoFocus,
  onRemoveRepo,
  onRevealRepoInFinder,
  onSetActiveWorktreePath,
  deleteConfirmPath,
  deleteNode,
  deleteFilename,
  onCancelDelete,
  onConfirmDelete,
  unlinkConfirmPath,
  onCancelUnlink,
  onConfirmUnlink,
  viewingPath,
  viewingFilename,
  viewingContent,
  onCloseViewer,
  onSaveMarkdown,
  viewingImage,
  onCloseImageViewer,
  confluenceLinkPath,
  onCloseLinkModal,
  linkDocumentTitle,
  syncConfluenceLink,
  confluenceSyncPath,
  onCloseSyncModal,
  onConfluenceContentUpdated,
}: ReposAndFilesOverlaysProps) {
  const isViewingClaudeMd = isContextFile(viewingFilename);

  return (
    <>
      <DropdownMenu
        isOpen={isAddMenuOpen}
        onClose={onCloseAddMenu}
        position={addMenuAnchorRef.current ? {
          type: 'anchor' as const,
          anchor: addMenuAnchorRef.current.getBoundingClientRect(),
          placement: 'bottom' as const,
        } : null}
        minWidth={140}
      >
        <CreateItemMenuItems onStartCreate={onStartCreate} />
      </DropdownMenu>

      <DropdownMenu
        isOpen={emptySpaceMenu !== null}
        onClose={onCloseEmptySpaceMenu}
        position={emptySpaceMenu ? { type: 'point' as const, x: emptySpaceMenu.x, y: emptySpaceMenu.y } : null}
        minWidth={140}
      >
        <CreateItemMenuItems onStartCreate={onStartCreate} />
      </DropdownMenu>

      {fileContextMenu && contextNode && (
        <FileContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          path={fileContextMenu.path}
          node={contextNode}
          isFocused={isContextPathFocused}
          onClose={onCloseFileContextMenu}
          onToggleFocus={onToggleContextFileFocus}
          onRename={onRenameContextFile}
          onRevealInFinder={onRevealContextFileInFinder}
          onCopyFullPath={onCopyContextFullPath}
          onCopyRelativePath={onCopyContextRelativePath}
          onView={contextNode.name.endsWith('.md') ? onViewContextFile : undefined}
          onDelete={onDeleteContextFile}
          onLinkToConfluence={onLinkToConfluence}
          onSyncConfluence={onSyncConfluence}
          onUnlinkFromConfluence={onUnlinkFromConfluence}
          isLinkedToConfluence={isContextFileLinkedToConfluence}
        />
      )}

      {repoContextMenu && repoContextRepo && (
        <RepoContextMenu
          x={repoContextMenu.x}
          y={repoContextMenu.y}
          repoId={repoContextRepo.id}
          repoPath={repoContextRepo.path}
          activeWorktreePath={repoContextRepo.active_worktree_path}
          worktrees={repoWorktrees}
          isFocused={isRepoFocused}
          onClose={onCloseRepoContextMenu}
          onToggleFocus={onToggleRepoFocus}
          onRemove={onRemoveRepo}
          onRevealInFinder={onRevealRepoInFinder}
          onSetActiveWorktreePath={onSetActiveWorktreePath}
        />
      )}

      {deleteConfirmPath && deleteNode && (
        <ConfirmActionDialog
          title={`Delete ${deleteNode.isDirectory ? 'Folder' : 'File'}?`}
          message={
            <>
              Are you sure you want to delete{' '}
              <span className="text-text-primary font-medium">"{deleteFilename}"</span>?
              {deleteNode.isDirectory && ' This will delete all contents inside.'}
            </>
          }
          dialogId="sidebar-file-delete-dialog"
          onCancel={onCancelDelete}
          action={{
            label: 'Delete',
            loadingText: 'Deleting...',
            variant: 'danger',
            onClick: onConfirmDelete,
            ariaLabel: `Delete ${deleteFilename} permanently`,
          }}
        />
      )}

      {unlinkConfirmPath && (
        <ConfirmActionDialog
          title="Unlink from Confluence?"
          message={
            <>
              This will remove the link between{' '}
              <span className="text-text-primary font-medium">"{unlinkConfirmPath}"</span>{' '}
              and its Confluence page. The Confluence page itself will not be deleted.
            </>
          }
          dialogId="sidebar-confluence-unlink-dialog"
          onCancel={onCancelUnlink}
          action={{
            label: 'Unlink',
            loadingText: 'Unlinking...',
            variant: 'danger',
            onClick: onConfirmUnlink,
            ariaLabel: `Unlink ${unlinkConfirmPath} from Confluence`,
          }}
        />
      )}

      <MarkdownDocumentModal
        isOpen={viewingPath !== null}
        onClose={onCloseViewer}
        onSave={onSaveMarkdown}
        onDelete={undefined}
        isDeleting={false}
        title={viewingFilename.replace(/\.md$/, '')}
        subtitle={isViewingClaudeMd ? 'Project context for AI agents' : 'Markdown document'}
        content={viewingContent}
        placeholder="Start writing..."
        icon={
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isViewingClaudeMd ? 'bg-accent/15' : 'bg-surface-2'
            }`}
          >
            <svg
              className={`w-4 h-4 ${isViewingClaudeMd ? 'text-accent' : 'text-text-muted'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        }
      />

      {viewingImage && (
        <ImageViewerModal
          isOpen={true}
          onClose={onCloseImageViewer}
          filename={viewingImage.filename}
          dataUrl={viewingImage.dataUrl}
          fileSize={viewingImage.size}
        />
      )}

      {confluenceLinkPath && (
        <LinkToConfluenceModal
          isOpen={true}
          onClose={onCloseLinkModal}
          projectId={projectId}
          documentPath={confluenceLinkPath}
          documentTitle={linkDocumentTitle}
        />
      )}

      {syncConfluenceLink && confluenceSyncPath && (
        <ConfluenceSyncPreviewModal
          isOpen={true}
          onClose={onCloseSyncModal}
          projectId={projectId}
          link={syncConfluenceLink}
          onContentUpdated={onConfluenceContentUpdated}
        />
      )}
    </>
  );
}
