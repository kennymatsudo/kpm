import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFileTreeStore } from '../../stores';
import { documentId, isDocumentDirty, useWorkspaceStore } from '../../stores/workspaceStore';
import { ChatPanel } from '../chat/ChatPanel';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { DocumentTabStrip } from './DocumentTabStrip';
import { FileEditor } from './FileEditor';
import { useDocumentAutosave } from './useDocumentAutosave';
import { WorkspaceHome } from './WorkspaceHome';
import { getParentPath } from '../../utils/path';
import { subscribe as subscribeToStoreEvent } from '../../stores/storeEvents';
import { useResizablePanel } from '../layout/hooks';
import { PANEL_SIZES } from '../../constants/layout';
import { readWorkspaceFile } from '../../services/workspaceFileService';

interface WorkspaceViewProps {
  projectId: string;
  chatCollapsed: boolean;
  onShowChat: () => void;
}

/**
 * Workspace View - Chat-first interface with document editing.
 * Sidebar is rendered by Layout, this component handles editor and chat panels.
 *
 * Adaptive layout:
 * - Default: Chat (full width)
 * - Editing: Editor (center) + Chat (right, narrower)
 *
 * Note: Pending file approvals (from Claude-generated content) are now handled
 * by ApprovalOverlays via Proposed Change disposal.
 */
export function WorkspaceView({ projectId, chatCollapsed, onShowChat }: WorkspaceViewProps) {
  // Deliberately the id and not the document: content lives in the store, so
  // subscribing to the object here would re-render the workspace and the chat
  // panel on every keystroke. The editor subscribes to its own document.
  const activeDocumentId = useWorkspaceStore((state) => state.activeDocumentId);
  const hasOpenDocuments = useWorkspaceStore((state) => state.openDocuments.length > 0);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);

  useDocumentAutosave();

  // File tree store for highlighting recently changed files
  const { markRecentlyChanged, expandToPath, refreshDirectory } = useFileTreeStore(
    useShallow((state) => ({
      markRecentlyChanged: state.markRecentlyChanged,
      expandToPath: state.expandToPath,
      refreshDirectory: state.refreshDirectory,
    }))
  );

  // Animation state for editor panel
  const [editorVisible, setEditorVisible] = useState(false);

  // Set project ID in store for saveFile to use
  useEffect(() => {
    setCurrentProjectId(projectId);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

  // Subscribe to bridged file changes for real-time editor updates. Every open
  // document listens, not just the visible one, so a background tab is never
  // left showing a file that moved or was deleted under it.
  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('file-explorer-changed', (event) => {
      const data = event.payload;
      if (data.projectId !== projectId) return;

      const store = useWorkspaceStore.getState();
      const id = documentId('project', data.path);
      const document = store.openDocuments.find((candidate) => candidate.id === id);
      if (!document) return;

      if (data.type === 'updated') {
        // With unsaved changes the buffer is the newer version, so leave the
        // user editing; the save indicator already says it has not landed.
        if (isDocumentDirty(document)) return;
        readWorkspaceFile(document.source, data.path, projectId)
          .then((content: string) => useWorkspaceStore.getState().reloadDocument(id, content))
          .catch(console.error);
        return;
      }

      if (data.type === 'deleted') {
        // Not closeDocument: flushing an unsaved buffer here would write the
        // file back into existence.
        store.discardDocument(id);
        return;
      }

      if (data.type === 'renamed' && data.newPath) {
        store.renameDocument(id, data.newPath);
        readWorkspaceFile(document.source, data.newPath, projectId)
          .then((content: string) =>
            useWorkspaceStore.getState().reloadDocument(documentId(document.source, data.newPath!), content)
          )
          .catch(console.error);
      }
    });
    return unsubscribe;
  }, [projectId]);

  // Subscribe to bridged Claude file updates for file tree highlighting
  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('chat-file-updated', (event) => {
      const data = event.payload;
      if (data.projectId !== projectId) return;

      // Determine if this is a create or modify
      const changeType = data.oldContent === null ? 'created' : 'modified';

      // Highlight the file in the tree
      markRecentlyChanged(data.filePath, changeType);

      // Only refresh/expand for relative project paths — skip absolute paths
      // (e.g. when Claude mistakenly proposes a path inside a connected repo)
      if (!data.filePath.startsWith('/') && !/^[a-zA-Z]:/.test(data.filePath)) {
        void expandToPath(data.projectId, data.filePath);
        void refreshDirectory(getParentPath(data.filePath, ''));
      }
    });
    return unsubscribe;
  }, [projectId, markRecentlyChanged, expandToPath, refreshDirectory]);

  // Workspace chat resize — pass containerRef so the max chat width accounts for sidebar space
  const containerRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const { width: workspaceChatWidth, handleResizeStart } = useResizablePanel(
    PANEL_SIZES.workspaceChat,
    { containerRef }
  );

  // Track if the editor panel is showing, for layout transitions
  const isEditing = hasOpenDocuments;

  // Which of the two prose columns the user is actually reading. The document
  // and the chat answer are the same size and the same color, so side by side
  // neither one leads. Styling reads this off the root element and quiets the
  // column that is not being read.
  const [readingFocus, setReadingFocus] = useState<'document' | 'chat' | 'none'>('none');

  // Engagement is reading, not hovering: a pointer crossing the panel on its
  // way elsewhere means nothing, but a scroll, a click, or a focus does.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engage = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // Dragging the seam between the columns is not reading either of them.
      if (resizeHandleRef.current?.contains(target)) return;

      const inEditor = editorPanelRef.current?.contains(target) ?? false;
      const next = inEditor ? 'document' : chatCollapsed ? 'none' : 'chat';
      // Only write on a real change, so one scroll gesture is one update.
      setReadingFocus((current) => (current === next ? current : next));
    };

    container.addEventListener('focusin', engage);
    container.addEventListener('pointerdown', engage);
    container.addEventListener('wheel', engage, { passive: true });
    return () => {
      container.removeEventListener('focusin', engage);
      container.removeEventListener('pointerdown', engage);
      container.removeEventListener('wheel', engage);
    };
  }, [chatCollapsed]);

  // A column that left the screen cannot be the one being read.
  useEffect(() => {
    setReadingFocus((current) => {
      if (current === 'document' && !isEditing) return 'none';
      if (current === 'chat' && chatCollapsed) return 'none';
      return current;
    });
  }, [isEditing, chatCollapsed]);

  // Animate editor panel in/out
  useEffect(() => {
    if (isEditing) {
      // Small delay for mount animation
      requestAnimationFrame(() => setEditorVisible(true));
    } else {
      setEditorVisible(false);
    }
  }, [isEditing]);

  const handleCloseActiveDocument = useCallback(() => {
    const { activeDocumentId, closeDocument } = useWorkspaceStore.getState();
    if (activeDocumentId) void closeDocument(activeDocumentId);
  }, []);

  return (
    <div
      ref={containerRef}
      // Names the column being read — "document", "chat", or "none" before the
      // user has touched either. Styling keys the reading register to it.
      data-reading-focus={readingFocus}
      className="flex flex-1 h-full overflow-hidden bg-surface-0"
    >
      {/* Editor Panel (only shown when editing) */}
      {isEditing && (
        <div
          ref={editorPanelRef}
          className={`
            flex-1 min-w-0 bg-surface-1 relative
            border-r border-border-subtle
            transition-[opacity,transform] duration-250 ease-out
            ${editorVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
          `}
        >
          <div className="flex flex-col h-full">
            <DocumentTabStrip />
            <div className="flex-1 min-h-0">
              <ErrorBoundary name="FileEditor">
                {activeDocumentId && (
                  <FileEditor
                    // Remounting per document is deliberate: the markdown editor
                    // keeps its own buffer, view mode, and a live Monaco model,
                    // so reusing one instance bleeds a file's undo history into
                    // the next tab.
                    key={activeDocumentId}
                    documentId={activeDocumentId}
                    onClose={handleCloseActiveDocument}
                  />
                )}
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {/* Workspace resize handle (only when editor is open) */}
      {isEditing && (
        <div
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
          className="relative w-1.5 cursor-col-resize flex-shrink-0 bg-border-subtle/70 hover:bg-accent/35 active:bg-accent/45 transition-colors"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border-default/80" />
        </div>
      )}

      {!isEditing && chatCollapsed && (
        <WorkspaceHome onShowChat={onShowChat} />
      )}

      {/* Chat Panel */}
      {!chatCollapsed && (
        <ChatPanel
          view="workspace"
          className={isEditing ? 'flex-shrink-0' : 'flex-1'}
          style={isEditing ? { width: workspaceChatWidth } : undefined}
        />
      )}
    </div>
  );
}
