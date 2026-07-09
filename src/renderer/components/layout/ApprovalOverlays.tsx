/**
 * ApprovalOverlays - Non-blocking side panel for pending approval items
 *
 * Renders a slide-in panel from the left for approval items (plan actions, CLAUDE.md edits,
 * document updates, review replies). The panel overlays the sidebar, keeping the
 * chat visible so users can reference Claude's explanations while reviewing changes.
 *
 * Uses a unified approval queue to handle multiple pending items from Claude.
 * Panel auto-expands when items arrive.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  useProjectDomainStore,
  usePlanDomainStore,
  useApprovalQueueStore,
  useFileTreeStore,
  useFocusModeStore,
} from '../../stores';
import type { ApprovalItem } from '../../stores';
import { toast } from '../../stores/toastStore';
import { emit } from '../../stores/storeEvents';
import { PendingActionsPanel } from '../planning/PendingActionsPanel';
import { PendingDocumentPanel } from '../planning/PendingDocumentPanel';
import { PendingMovePanel } from '../planning/PendingMovePanel';
import { PendingDeletePanel } from '../planning/PendingDeletePanel';
import { ReviewReplyApprovalPanel } from '../development/ReviewReplyApprovalPanel';
import { Z_INDEX } from '../../constants/zIndex';
import { getParentPath } from '../../utils/path';

/** Get a display label for approval item type */
function getItemTypeLabel(type: ApprovalItem['type']): string {
  switch (type) {
    case 'plan-actions': return 'Plan Changes';
    case 'claude-md': return 'Project Context Update';
    case 'document': return 'Document Update';
    case 'move': return 'Confirm Move';
    case 'delete': return 'Confirm Deletion';
    case 'review-reply': return 'Review Reply';
    default: return 'Pending Approval';
  }
}

/** Get an icon for approval item type */
function getItemTypeIcon(type: ApprovalItem['type']): React.ReactNode {
  switch (type) {
    case 'plan-actions':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'claude-md':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'document':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    case 'move':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    case 'delete':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case 'review-reply':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-1 7l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export function ApprovalOverlays() {
  // Get queue state
  const { queue, removeById, userMinimized, panelWidth, setUserMinimized, setPanelWidth } = useApprovalQueueStore(
    useShallow((state) => ({
      queue: state.queue,
      removeById: state.removeById,
      userMinimized: state.userMinimized,
      panelWidth: state.panelWidth,
      setUserMinimized: state.setUserMinimized,
      setPanelWidth: state.setPanelWidth,
    }))
  );

  // Get project store data needed for panels
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const planItems = usePlanDomainStore((state) => state.planItems);
  const { focusModeOpen, focusedDocPath, updateFocusedDocContent } = useFocusModeStore(
    useShallow((state) => ({
      focusModeOpen: state.isOpen,
      focusedDocPath: state.docPath,
      updateFocusedDocContent: state.updateContent,
    }))
  );

  // Get execution methods from approval queue store
  const {
    executePlanActions,
    executeClaudeMdWrite,
    executeFileWrite,
    executeFileMove,
    executeFileDelete,
    executeReviewReply,
  } = useApprovalQueueStore(
    useShallow((state) => ({
      executePlanActions: state.executePlanActions,
      executeClaudeMdWrite: state.executeClaudeMdWrite,
      executeFileWrite: state.executeFileWrite,
      executeFileMove: state.executeFileMove,
      executeFileDelete: state.executeFileDelete,
      executeReviewReply: state.executeReviewReply,
    }))
  );

  const [isApplying, setIsApplying] = useState(false);

  // Resizable panel width (follows same pattern as usePanelResize)
  const MIN_PANEL_WIDTH = 380;
  const MAX_PANEL_WIDTH = 900;
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPanel(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      pendingWidth.current = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + delta));

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingWidth.current !== null) {
            setPanelWidth(pendingWidth.current);
            pendingWidth.current = null;
          }
          rafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingWidth.current !== null) {
        setPanelWidth(pendingWidth.current);
        pendingWidth.current = null;
      }
      setIsResizingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isResizingPanel]);

  // Current item to show (first in queue)
  const currentItem = queue.length > 0 ? queue[0] : null;
  const queueLength = queue.length;

  // Panel is open iff there's something to show and the user hasn't explicitly
  // minimized this batch. The store resets userMinimized on any meaningful new
  // enqueue, so subsequent approvals re-surface even after the user minimized.
  const isPanelOpen = queueLength > 0 && !userMinimized;

  // Handlers for different approval types

  const handleApprovePlanActions = useCallback(async (item: ApprovalItem & { type: 'plan-actions' }) => {
    setIsApplying(true);
    try {
      const result = await executePlanActions(item.actions);
      if (result.success) {
        removeById(item.id);
        if (result.warning) {
          toast.warning(result.warning);
        }
      } else {
        toast.error(`Failed to apply changes: ${result.error}`);
      }
    } finally {
      setIsApplying(false);
    }
  }, [executePlanActions, removeById]);

  const handleApplyClaudeMdEdit = useCallback(async (item: ApprovalItem & { type: 'claude-md' }, content: string) => {
    if (!currentProjectId) return;
    setIsApplying(true);
    try {
      const result = await executeClaudeMdWrite(currentProjectId, content);
      if (result.success) {
        removeById(item.id);
      } else {
        toast.error(`Failed to update project context file: ${result.error}`);
      }
    } finally {
      setIsApplying(false);
    }
  }, [currentProjectId, executeClaudeMdWrite, removeById]);

  const handleAcceptDocument = useCallback(async (item: ApprovalItem & { type: 'document' }, content: string) => {
    if (!currentProjectId) return;
    setIsApplying(true);
    try {
      const result = await executeFileWrite(currentProjectId, item.filePath, content);
      if (result.success) {
        removeById(item.id);
        // Refresh the parent directory so the new file appears in the tree
        const parentPath = getParentPath(item.filePath, '');
        void useFileTreeStore.getState().refreshDirectory(parentPath);
        if (focusModeOpen && focusedDocPath === item.filePath) {
          updateFocusedDocContent(item.filePath, content);
          return;
        }
        // Navigate to workspace and open the newly created document
        emit({
          type: 'navigate-to-view',
          payload: { view: 'workspace', filePath: item.filePath },
        });
      } else {
        toast.error(`Failed to update ${item.filePath}: ${result.error}`);
      }
    } finally {
      setIsApplying(false);
    }
  }, [currentProjectId, executeFileWrite, focusModeOpen, focusedDocPath, removeById, updateFocusedDocContent]);

  const handleConfirmMove = useCallback(async (item: ApprovalItem & { type: 'move' }) => {
    if (!currentProjectId) return;
    setIsApplying(true);
    try {
      const result = await executeFileMove(currentProjectId, item.sourcePath, item.targetPath);
      if (result.success) {
        removeById(item.id);
        const sourceParentPath = getParentPath(item.sourcePath, '');
        const targetParentPath = getParentPath(item.targetPath, '');
        void useFileTreeStore.getState().refreshDirectory(sourceParentPath);
        if (targetParentPath !== sourceParentPath) void useFileTreeStore.getState().refreshDirectory(targetParentPath);
      } else {
        toast.error(`Failed to move ${item.sourcePath}: ${result.error}`);
      }
    } finally {
      setIsApplying(false);
    }
  }, [currentProjectId, executeFileMove, removeById]);

  const handleConfirmDelete = useCallback(async (item: ApprovalItem & { type: 'delete' }) => {
    if (!currentProjectId) return;
    setIsApplying(true);
    try {
      const result = await executeFileDelete(currentProjectId, item.filePath);
      if (result.success) {
        removeById(item.id);
        // Refresh the parent directory so the deleted entry disappears from the tree
        const parentPath = getParentPath(item.filePath, '');
        void useFileTreeStore.getState().refreshDirectory(parentPath);
      } else {
        toast.error(`Failed to delete ${item.filePath}: ${result.error}`);
      }
    } finally {
      setIsApplying(false);
    }
  }, [currentProjectId, executeFileDelete, removeById]);

  const handleApproveReviewReply = useCallback(async (
    item: ApprovalItem & { type: 'review-reply' },
    body: string,
    resolve: boolean
  ) => {
    setIsApplying(true);
    try {
      const result = await executeReviewReply({
        sessionId: item.sessionId,
        threadId: item.threadId,
        body,
        resolve,
      });
      if (result.success) {
        removeById(item.id);
        toast.success(resolve ? 'Reply posted and thread resolved' : 'Reply posted');
      } else {
        toast.error(`Failed to post review reply: ${result.error}`);
      }
    } finally {
      setIsApplying(false);
    }
  }, [executeReviewReply, removeById]);

  const handleDismiss = useCallback((id: string) => {
    removeById(id);
  }, [removeById]);

  const handleCollapse = useCallback(() => {
    setUserMinimized(true);
  }, [setUserMinimized]);

  // Collapsed badge (shown when panel is collapsed and there are pending items)
  const collapsedBadge = useMemo(() => {
    if (queueLength === 0 || isPanelOpen) return null;

    return (
      <m.button
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={() => setUserMinimized(false)}
        className="fixed left-5 bottom-5 group" style={{ zIndex: focusModeOpen ? Z_INDEX.modal + 30 : Z_INDEX.panel }}
      >
        <div className="relative flex items-center gap-2.5 px-3 py-2
                        bg-[color-mix(in_srgb,var(--color-accent)_85%,black)]
                        text-white rounded
                        border border-accent/30
                        transition-colors duration-100">
          {/* Pulsing indicator */}
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-white" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-white animate-ping opacity-75" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            {queueLength} pending
          </span>
          {/* Chevron hint */}
          <svg className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </m.button>
    );
  }, [queueLength, isPanelOpen, focusModeOpen]);

  if (!currentItem && !collapsedBadge) return null;

  // Side panel content - render the appropriate panel based on current item type
  const panelContent = currentItem ? (
    <>
      {currentItem.type === 'plan-actions' && (
        <PendingActionsPanel
          actions={currentItem.actions}
          planItems={planItems}
          onApprove={() => handleApprovePlanActions(currentItem)}
          onDismiss={() => handleDismiss(currentItem.id)}
          isApplying={isApplying}
          embedded
        />
      )}

      {currentItem.type === 'claude-md' && (
        <PendingDocumentPanel
          filePath="Project Context"
          content={currentItem.newContent}
          oldContent={currentItem.oldContent}
          onAccept={(content) => handleApplyClaudeMdEdit(currentItem, content)}
          onDismiss={() => handleDismiss(currentItem.id)}
          isApplying={isApplying}
          embedded
        />
      )}

      {currentItem.type === 'document' && (
        <PendingDocumentPanel
          filePath={currentItem.filePath}
          content={currentItem.content}
          oldContent={currentItem.oldContent}
          onAccept={(content) => handleAcceptDocument(currentItem, content)}
          onDismiss={() => handleDismiss(currentItem.id)}
          isApplying={isApplying}
          embedded
        />
      )}

      {currentItem.type === 'move' && (
        <PendingMovePanel
          sourcePath={currentItem.sourcePath}
          targetPath={currentItem.targetPath}
          onConfirm={() => handleConfirmMove(currentItem)}
          onDismiss={() => handleDismiss(currentItem.id)}
          isApplying={isApplying}
          embedded
        />
      )}

      {currentItem.type === 'delete' && (
        <PendingDeletePanel
          filePath={currentItem.filePath}
          isDirectory={currentItem.isDirectory}
          onConfirm={() => handleConfirmDelete(currentItem)}
          onDismiss={() => handleDismiss(currentItem.id)}
          isApplying={isApplying}
          embedded
        />
      )}

      {currentItem.type === 'review-reply' && (
        <ReviewReplyApprovalPanel
          draft={currentItem}
          onApprove={(body, resolve) => handleApproveReviewReply(currentItem, body, resolve)}
          onDismiss={() => handleDismiss(currentItem.id)}
          embedded
        />
      )}
    </>
  ) : null;

  return createPortal(
    <>
      {/* Collapsed badge */}
      <AnimatePresence>
        {collapsedBadge}
      </AnimatePresence>

      {/* Side panel - slides from left, no blocking backdrop */}
      <AnimatePresence>
        {isPanelOpen && currentItem && (
          <m.div
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-0 max-w-[90vw]
                       bg-surface-1
                       border-r border-border-strong
                       flex flex-col overflow-hidden"
            style={{
              zIndex: focusModeOpen ? Z_INDEX.modal + 20 : Z_INDEX.panel - 10,
              top: focusModeOpen ? 0 : 'var(--titlebar-height)',
              height: focusModeOpen ? '100%' : 'calc(100% - var(--titlebar-height))',
              width: panelWidth,
            }}
          >
            {/* Panel header */}
            <div className="relative flex items-center justify-between px-4 py-2.5
                            bg-surface-2
                            border-b border-border-subtle">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent/40" />

              <div className="flex items-center gap-3">
                {/* Icon with accent background */}
                <div className="w-8 h-8 rounded-lg bg-accent/12 flex items-center justify-center text-accent">
                  {getItemTypeIcon(currentItem.type)}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-text-primary leading-tight">
                    {getItemTypeLabel(currentItem.type)}
                  </span>
                  {queueLength > 1 && (
                    <span className="text-xxs text-text-muted mt-0.5">
                      +{queueLength - 1} more in queue
                    </span>
                  )}
                </div>
              </div>

              {/* Minimize button - chevron points left toward panel edge */}
              <m.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCollapse}
                className="w-8 h-8 flex items-center justify-center rounded-lg
                           bg-surface-3/50 hover:bg-surface-3
                           text-text-muted hover:text-text-primary
                           transition-colors duration-150"
                title="Minimize"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </m.button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {panelContent}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Resize handle - plain div outside overflow-hidden panel */}
      {isPanelOpen && currentItem && (
        <div
          onMouseDown={handlePanelResizeStart}
          className="fixed cursor-col-resize group"
          style={{
            zIndex: Z_INDEX.panel - 9,
            top: 'var(--titlebar-height)',
            height: 'calc(100% - var(--titlebar-height))',
            left: panelWidth - 3,
            width: 8,
          }}
        >
          <div className="absolute top-0 right-0 w-[2px] h-full
                          bg-transparent group-hover:bg-accent/40 group-active:bg-accent/60
                          transition-colors duration-100" />
        </div>
      )}
    </>,
    document.body
  );
}
