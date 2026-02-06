/**
 * ApprovalOverlays - Non-blocking side panel for pending approval items
 *
 * Renders a slide-in panel from the left for approval items (plan actions, CLAUDE.md edits,
 * chat visible so users can reference Claude's explanations while reviewing changes.
 *
 * Uses a unified approval queue to handle multiple pending items from Claude.
 * Panel auto-expands when items arrive.
 */

import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import type { ApprovalItem } from '../../stores';
import { toast } from '../../stores/toastStore';
import { emit } from '../../stores/storeEvents';
import { PendingActionsPanel } from '../planning/PendingActionsPanel';
import { PendingDocumentPanel } from '../planning/PendingDocumentPanel';

/** Get a display label for approval item type */
function getItemTypeLabel(type: ApprovalItem['type']): string {
  switch (type) {
    case 'plan-actions': return 'Plan Changes';
    case 'document': return 'Document Update';
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
    useShallow((state) => ({
      queue: state.queue,
      removeById: state.removeById,
    }))
  );

  // Get project store data needed for panels

  const {
    executePlanActions,
    executeClaudeMdWrite,
    executeFileWrite,
    useShallow((state) => ({
      executePlanActions: state.executePlanActions,
      executeClaudeMdWrite: state.executeClaudeMdWrite,
      executeFileWrite: state.executeFileWrite,
    }))
  );

  const [isApplying, setIsApplying] = useState(false);

  // Current item to show (first in queue)
  const currentItem = queue.length > 0 ? queue[0] : null;
  const queueLength = queue.length;


  // Handlers for different approval types

  const handleApprovePlanActions = useCallback(async (item: ApprovalItem & { type: 'plan-actions' }) => {
    setIsApplying(true);
    try {
      const result = await executePlanActions(item.actions);
      if (result.success) {
        removeById(item.id);
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
        void useFileTreeStore.getState().refreshDirectory(parentPath);
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

  const handleDismiss = useCallback((id: string) => {
    removeById(id);
  }, [removeById]);

  const handleCollapse = useCallback(() => {

  // Collapsed badge (shown when panel is collapsed and there are pending items)
  const collapsedBadge = useMemo(() => {

    return (
      <m.button
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
      >
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
          <m.div
            animate={{ x: 0, opacity: 1 }}
                       flex flex-col overflow-hidden"
          >
                            border-b border-border-subtle">

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
    </>,
    document.body
  );
}
