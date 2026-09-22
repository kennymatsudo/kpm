import { useState, useMemo, useCallback, useEffect } from 'react';
import { BulkActionsMenu } from './BulkActionsMenu';
import { PlanCardMenu } from './PlanCardMenu';
import { BulkDeleteConfirmDialog } from './BulkDeleteConfirmDialog';
import { CreateItemModal } from './CreateItemModal';
import { BoardView } from '../board-view';
import { AgentStartModal } from '../board-view/AgentStartModal';
import { LinkPrToItemDialog } from '../development/LinkPrToItemDialog';
import { TaskEditModal } from './TaskEditModal';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { LoadingSpinner } from '../ui';
import {
  toast,
  useProjectDomainStore,
  usePlanDomainStore,
  useProjectUiDomainStore,
  useTrackerStore,
  useExportStore,
  useResourceDomainStore,
  selectNormalizedPlanItems,
  selectFocusedPlanItemId,
  selectDescendantIds,
} from '../../stores';
import { useDevSessionsStore } from '../../stores/devSessions';
import { createAndStartAgentSession } from '../../services/agentSessionService';
import { resolveStatusCategory } from '../../constants/statusConfig';
import { useShallow } from 'zustand/react/shallow';
import {
  useBulkActions,
  usePlanTaskEdit,
  useCreateItemModal,
  usePlanContextMenu,
  usePlanItemSelection,
} from './hooks';
import type {
  PlanItem,
  StatusCategory,
  RepoEnvironmentMode,
} from '../../../shared/types';

interface PlanViewProps {
  filteredPlannedItems: PlanItem[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  hiddenStatusCategories: Set<StatusCategory>;
  onHiddenStatusCategoriesChange: (categories: Set<StatusCategory>) => void;
  selectedItemIds: Set<string>;
  setSelectedItemIds: (ids: Set<string>) => void;
  /** Register a callback to open create item modal (for Cmd+Shift+I from Layout) */
  registerCreateItemHandler?: (handler: (() => void) | null) => void;
}

export function PlanView({
  filteredPlannedItems,
  searchQuery,
  onSearchChange: _onSearchChange,
  hiddenStatusCategories: _hiddenStatusCategories,
  onHiddenStatusCategoriesChange: _onHiddenStatusCategoriesChange,
  selectedItemIds,
  setSelectedItemIds,
  registerCreateItemHandler,
}: PlanViewProps) {
  const { planItems, executePlanActions } = usePlanDomainStore(
    useShallow((state) => ({
      planItems: state.planItems,
      executePlanActions: state.executePlanActions,
    }))
  );
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const {
    isLoading,
    focusedResources,
    addFocusedResource,
    addFocusedResources,
  } = useProjectUiDomainStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      focusedResources: state.focusedResources,
      addFocusedResource: state.addFocusedResource,
      addFocusedResources: state.addFocusedResources,
    }))
  );

  const normalizedPlanItems = useMemo(() => selectNormalizedPlanItems(planItems), [planItems]);
  const planItemsById = normalizedPlanItems.byId;

  // Derive focusedItemId from focusedResources for backward compatibility with child components
  const focusedItemId = useMemo(
    () => selectFocusedPlanItemId(focusedResources),
    [focusedResources]
  );

  // Tracker store - check if we have tracker associations
  const associations = useTrackerStore((state) => state.associations);
  const activeTrackerType = associations[0]?.tracker_type ?? null;
  const hasTrackerAssociation = !!activeTrackerType;

  // Export store - for queue operations
  const addToQueue = useExportStore((state) => state.addToQueue);

  // --- Extracted hooks ---

  const {
    editingItem,
    handleEditItem,
    prefetchEditItem,
    handleSaveTask,
    closeEditModal,
  } = usePlanTaskEdit({ planItemsById, executePlanActions });

  const {
    createItemContext,
    handleCreateItemFromBoard,
    closeCreateItemModal,
    handleCreateItemSubmit,
  } = useCreateItemModal({ executePlanActions, registerCreateItemHandler });

  const {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    handleQueueForTracker,
    handleAddToContext,
    handleAddItemToContext,
    handleItemContextMenu,
  } = usePlanContextMenu({
    currentProjectId,
    selectedItemIds,
    planItemsById,
    addFocusedResource,
    addFocusedResources,
    addToQueue,
  });

  const handleAddItemToContextWithToast = useCallback(
    (itemId: string) => {
      const result = handleAddItemToContext(itemId);
      const title = planItemsById.get(itemId)?.title ?? 'Item';
      if (result.added) toast.success(`Added "${title}" to chat context`);
      else toast.info(`"${title}" is already in chat context`);
    },
    [handleAddItemToContext, planItemsById]
  );

  const handleBulkAddToContextWithToast = useCallback(() => {
    const result = handleAddToContext();
    if (result.added > 0 && result.alreadyPresent > 0) {
      toast.success(`Added ${result.added} to chat context (${result.alreadyPresent} already present)`);
    } else if (result.added > 0) {
      toast.success(`Added ${result.added} to chat context`);
    } else if (result.alreadyPresent > 0) {
      toast.info(`All ${result.alreadyPresent} already in chat context`);
    }
  }, [handleAddToContext]);

  // --- Selection & bulk operations ---

  const { handleSelectItem, handleSelectRange } = usePlanItemSelection({
    selectedItemIds,
    setSelectedItemIds,
  });

  // Descendant tracking for bulk operations
  const descendantIds = useMemo(
    () => selectDescendantIds(planItems, selectedItemIds),
    [planItems, selectedItemIds]
  );

  const trackerLinkedDeletion = useMemo(() => {
    const combinedIds = new Set([...selectedItemIds, ...descendantIds]);
    const linked = planItems.filter(
      (item) => combinedIds.has(item.id) && item.external_key && item.external_type
    );
    const trackerTypes = new Set(linked.map((item) => item.external_type));
    return {
      count: linked.length,
      trackerType: trackerTypes.size === 1 ? [...trackerTypes][0] : null,
    };
  }, [planItems, selectedItemIds, descendantIds]);

  const {
    showBulkDeleteDialog,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    handleBulkDeleteOrphan,
    handleBulkDeleteAll,
  } = useBulkActions({
    selectedItemIds,
    descendantIds,
    executePlanActions,
    setSelectedItemIds,
  });

  // --- Link PR to item ---

  const repos = useResourceDomainStore((state) => state.repos);
  const [linkPrItemId, setLinkPrItemId] = useState<string | null>(null);

  const handleLinkPr = useCallback((itemId: string) => {
    setLinkPrItemId(itemId);
  }, []);

  // --- Agent start modal ---

  const [agentStartItemId, setAgentStartItemId] = useState<string | null>(null);
  const [boardDetailSessionId, setBoardDetailSessionId] = useState<string | null>(null);
  const agentStartItem = agentStartItemId ? planItems.find((i) => i.id === agentStartItemId) : undefined;
  const updateStatusCategory = usePlanDomainStore((state) => state.updateStatusCategory);
  const loadSessions = useDevSessionsStore((state) => state.loadSessions);

  const handleStartAgent = useCallback((itemId: string) => {
    setAgentStartItemId(itemId);
  }, []);

  const handleAgentMoveOnly = useCallback(async () => {
    if (!agentStartItemId) return;
    const itemId = agentStartItemId;
    setAgentStartItemId(null);
    await updateStatusCategory(itemId, 'in_progress');
  }, [agentStartItemId, updateStatusCategory]);

  const handleAgentStartConfirmed = useCallback(async (params: {
    planItemId: string;
    repoId: string;
    prompt?: string;
    baseBranch?: string;
    contextPaths?: string[];
    environmentMode?: RepoEnvironmentMode;
    playbookId?: string;
  }) => {
    const item = planItems.find((i) => i.id === params.planItemId);
    const currentStatus = item
      ? resolveStatusCategory(item) ?? 'not_started'
      : null;

    setAgentStartItemId(null);

    const result = await createAndStartAgentSession({
      planItemId: params.planItemId,
      repoId: params.repoId,
      prompt: params.prompt,
      baseBranch: params.baseBranch,
      contextPaths: params.contextPaths,
      environmentMode: params.environmentMode,
      playbookId: params.playbookId,
    });

    if (!result.success) {
      toast.error(result.error || 'Failed to start agent session');
      return;
    }

    if (currentStatus && currentStatus !== 'in_progress') {
      await updateStatusCategory(params.planItemId, 'in_progress');
    }

    if (currentProjectId) {
      void loadSessions(currentProjectId);
    }
  }, [planItems, currentProjectId, loadSessions, updateStatusCategory]);

  // A notification (or anything else) can ask for a session's detail pane before
  // this view is mounted, so the request waits on the store until we can honour it.
  const requestedDetailSessionId = useDevSessionsStore((state) => state.selectedSessionId);
  useEffect(() => {
    if (!requestedDetailSessionId) return;
    setBoardDetailSessionId(requestedDetailSessionId);
    useDevSessionsStore.getState().setSelectedSessionId(null);
  }, [requestedDetailSessionId]);

  // --- Derived data ---

  // All filtered items for board view
  const leafItems = useMemo(
    () => filteredPlannedItems,
    [filteredPlannedItems]
  );


  // Initial fetch for this project: distinguish "still loading" from "empty plan"
  // so the view area doesn't render as an empty board while items load.
  if (currentProjectId && isLoading && planItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-surface-0">
        <div className="flex items-center gap-3 text-text-muted">
          <LoadingSpinner className="w-4 h-4" />
          <span className="text-sm">Loading plan</span>
        </div>
      </div>
    );
  }

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-surface-0 text-text-secondary">
        <div className="text-center w-80">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 shadow-sm flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-text-primary whitespace-nowrap">Select or create a project</p>
          <p className="text-sm mt-2 text-text-muted leading-relaxed whitespace-normal">
            Use File - New Project to create your first project, or select an existing one from the sidebar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-0 flex">
      {/* Main Plan Area — min-w-0 lets this flex column shrink to its container
          instead of being sized by content; without it the board can be computed
          wider than <main>, whose overflow-hidden then clips the right-anchored
          detail pane (timestamps cut off). */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="flex-1 overflow-hidden" onContextMenu={handleContextMenu}>
          <ErrorBoundary name="BoardView">
            <BoardView
              items={leafItems}
              allItems={planItems}
              selectedIds={selectedItemIds}
              focusedItemId={focusedItemId}
              searchQuery={searchQuery}
              onSelectItem={handleSelectItem}
              onSelectRange={handleSelectRange}
              onEditItem={handleEditItem}
              onPrepareEditItem={prefetchEditItem}
              onContextMenu={handleItemContextMenu}
              onCreateItem={handleCreateItemFromBoard}
              onStartAgent={handleStartAgent}
              detailSessionId={boardDetailSessionId}
              onDetailSessionChange={setBoardDetailSessionId}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Context Menu — single-item gets full agent menu, multi-select gets bulk actions */}
      {contextMenu?.singleItemId ? (
        <PlanCardMenu
          itemId={contextMenu.singleItemId}
          isOpen={true}
          position={{ type: 'point', x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onEditItem={() => handleEditItem(contextMenu.singleItemId!)}
          onDelete={openBulkDeleteDialog}
          onAddToContext={() => handleAddItemToContextWithToast(contextMenu.singleItemId!)}
          onAddToTrackerQueue={handleQueueForTracker}
          hasTrackerAssociation={hasTrackerAssociation}
          trackerType={activeTrackerType}
          onLinkPr={() => handleLinkPr(contextMenu.singleItemId!)}
          onStartAgent={handleStartAgent}
          onOpenDetail={setBoardDetailSessionId}
        />
      ) : contextMenu ? (
        <BulkActionsMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedItemIds.size}
          hasTrackerAssociation={hasTrackerAssociation}
          trackerType={activeTrackerType}
          onEdit={() => {
            const selectedId = Array.from(selectedItemIds)[0];
            if (selectedId) handleEditItem(selectedId);
          }}
          onAddToContext={handleBulkAddToContextWithToast}
          onQueueForTracker={handleQueueForTracker}
          onDelete={openBulkDeleteDialog}
          onClose={closeContextMenu}
        />
      ) : null}

      {/* Link PR to Item Dialog */}
      {linkPrItemId && (
        <LinkPrToItemDialog
          isOpen={true}
          onClose={() => setLinkPrItemId(null)}
          planItemId={linkPrItemId}
          repos={repos}
          onLinked={() => {
            if (currentProjectId) {
              void loadSessions(currentProjectId);
            }
          }}
        />
      )}

      {/* Agent Start Modal */}
      {agentStartItem && (
        <AgentStartModal
          item={agentStartItem}
          onStart={handleAgentStartConfirmed}
          onClose={() => setAgentStartItemId(null)}
          onMoveOnly={handleAgentMoveOnly}
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {showBulkDeleteDialog && (
        <BulkDeleteConfirmDialog
          itemCount={selectedItemIds.size}
          descendantCount={descendantIds.size}
          trackerLinkedCount={trackerLinkedDeletion.count}
          trackerType={trackerLinkedDeletion.trackerType}
          onDeleteOrphan={handleBulkDeleteOrphan}
          onDeleteAll={handleBulkDeleteAll}
          onCancel={closeBulkDeleteDialog}
        />
      )}

      {/* Task Edit Modal */}
      {editingItem && (
        <ErrorBoundary name="TaskEditModal">
          <TaskEditModal
            item={editingItem}
            repos={repos}
            isOpen={!!editingItem}
            onClose={closeEditModal}
            onSave={handleSaveTask}
          />
        </ErrorBoundary>
      )}

      {/* Create Item Modal */}
      {createItemContext && (
        <ErrorBoundary name="CreateItemModal">
          <CreateItemModal
            isOpen={createItemContext.isOpen}
            onClose={closeCreateItemModal}
            projectId={currentProjectId}
            defaultParentId={createItemContext.parentId}
            defaultStatus={createItemContext.status}
            planItems={planItems}
            repos={repos}
            onSubmit={handleCreateItemSubmit}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

// Export the openCreateItemModal function for Layout to use
export { type CreateItemData } from './CreateItemModal';
