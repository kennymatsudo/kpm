import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './Canvas';
import { BulkActionsMenu } from './BulkActionsMenu';
import { PlanCardMenu } from './PlanCardMenu';
import { BulkDeleteConfirmDialog } from './BulkDeleteConfirmDialog';
import { CreateItemModal } from './CreateItemModal';
import { TreeView } from '../tree-view';
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
  useGroupStore,
  useResourceDomainStore,
  selectNormalizedPlanItems,
  selectFocusedPlanItemId,
  selectDescendantIds,
} from '../../stores';
import { useDevSessionsStore } from '../../stores/devSessions';
import { createAndStartAgentSession } from '../../services/agentSessionService';
import { buildHierarchyTree } from '../../utils/planHierarchy';
import { getStatusCategory } from '../../constants/statusConfig';
import { useShallow } from 'zustand/react/shallow';
import {
  useBulkActions,
  useAutoLayout,
  useGroupCollisionResolution,
  usePlanTaskEdit,
  useCreateItemModal,
  usePlanContextMenu,
  usePlanItemSelection,
} from './hooks';
import type { ViewMode } from './ViewSwitcher';
import type {
  PlanItem,
  StatusCategory,
  AgentEffortLevel,
  AgentExecutionMode,
  AgentReviewPolicy,
  RepoEnvironmentMode,
} from '../../../shared/types';

interface PlanViewProps {
  viewMode: ViewMode;
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
  viewMode,
  filteredPlannedItems,
  searchQuery,
  onSearchChange: _onSearchChange,
  hiddenStatusCategories: _hiddenStatusCategories,
  onHiddenStatusCategoriesChange: _onHiddenStatusCategoriesChange,
  selectedItemIds,
  setSelectedItemIds,
  registerCreateItemHandler,
}: PlanViewProps) {
  const {
    planItems,
    executePlanActions,
    updateItemPosition,
    updateItemPositions,
    updatePlanItem,
  } = usePlanDomainStore(
    useShallow((state) => ({
      planItems: state.planItems,
      executePlanActions: state.executePlanActions,
      updateItemPosition: state.updateItemPosition,
      updateItemPositions: state.updateItemPositions,
      updatePlanItem: state.updatePlanItem,
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
  const plannedItems = normalizedPlanItems.plannedItems;

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

  // Group store - for groups and layout
  const { groups, updateGroupPosition, updateGroupSize } = useGroupStore(
    useShallow((state) => ({
      groups: state.groups,
      updateGroupPosition: state.updateGroupPosition,
      updateGroupSize: state.updateGroupSize,
    }))
  );

  // --- Extracted hooks ---

  const {
    editingItem,
    handleEditItem,
    prefetchEditItem,
    handleSaveTask,
    closeEditModal,
  } = usePlanTaskEdit({ planItemsById, updatePlanItem });

  const {
    createItemContext,
    handleCreateItemFromCanvas,
    handleCreateItemFromTree,
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
    handleTreeContextMenu,
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

  const handleReparent = useCallback(
    async (itemIds: string[], newParentId: string | null) => {
      const actions = itemIds.map((id) => ({
        type: 'reparent' as const,
        item_id: id,
        new_parent_id: newParentId,
      }));
      await executePlanActions(actions);
    },
    [executePlanActions]
  );

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
    prompt: string;
    baseBranch?: string;
    contextPaths?: string[];
    effort?: AgentEffortLevel;
    environmentMode?: RepoEnvironmentMode;
    executionMode?: AgentExecutionMode;
    reviewPolicy?: AgentReviewPolicy;
  }) => {
    const item = planItems.find((i) => i.id === params.planItemId);
    const currentStatus = item
      ? item.status_category ?? getStatusCategory(item.external_status, item.external_type) ?? 'not_started'
      : null;

    setAgentStartItemId(null);

    const result = await createAndStartAgentSession(
      params.planItemId,
      params.repoId,
      params.prompt,
      undefined,
      params.baseBranch,
      params.contextPaths,
      params.effort,
      params.environmentMode,
      params.executionMode,
      params.reviewPolicy,
    );

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

  useEffect(() => {
    if (viewMode !== 'board' && boardDetailSessionId !== null) {
      setBoardDetailSessionId(null);
    }
  }, [boardDetailSessionId, viewMode]);

  // --- Auto layout & collision resolution ---

  const handleAutoLayout = useAutoLayout({
    plannedItems: filteredPlannedItems, // Use filtered items so new items are placed near visible content
    groups,
    updateItemPosition,
    updateGroupPosition,
    updateGroupSize,
  });

  // Collision resolution for when items are added to groups
  const resolveCollisionsForGroup = useGroupCollisionResolution({
    plannedItems: filteredPlannedItems,
    groups,
    updateGroupPosition,
    updateGroupSize,
  });

  const handleAssignToGroup = useCallback(
    async (itemIds: string[], groupId: string | null) => {
      const actions = itemIds.map((id) => ({
        type: 'assign_to_group' as const,
        item_id: id,
        group_id: groupId,
      }));
      await executePlanActions(actions);
    },
    [executePlanActions]
  );

  // Track previous group assignments to detect changes (for MCP tool updates)
  const prevGroupAssignmentsRef = useRef<Map<string, string | null>>(new Map());
  const hasInitializedGroupAssignmentsRef = useRef(false);
  const prevGroupCollapsedRef = useRef<Map<string, boolean>>(new Map());

  // Reset assignment diff state when project changes to avoid cross-project drift.
  useEffect(() => {
    prevGroupAssignmentsRef.current = new Map();
    hasInitializedGroupAssignmentsRef.current = false;
  }, [currentProjectId]);

  // Watch for group assignment changes (handles MCP tool updates)
  useEffect(() => {
    const previousAssignments = prevGroupAssignmentsRef.current;
    const currentAssignments = new Map<string, string | null>();
    const affectedGroupIds = new Set<string>();
    const shouldDebug = typeof window !== 'undefined' &&
      (window as unknown as { __DEBUG_GROUP_LAYOUT?: boolean }).__DEBUG_GROUP_LAYOUT === true;

    // Build current assignments map and detect changes
    for (const item of plannedItems) {
      currentAssignments.set(item.id, item.group_id);

      const prevGroupId = previousAssignments.get(item.id);
      const currentGroupId = item.group_id;

      // If group assignment changed
      if (prevGroupId !== currentGroupId) {
        if (currentGroupId) {
          affectedGroupIds.add(currentGroupId);
        }
        if (prevGroupId) {
          affectedGroupIds.add(prevGroupId);
        }
        if (shouldDebug) {
          console.debug('[group-assignment]', {
            itemId: item.id,
            from: prevGroupId,
            to: currentGroupId,
          });
        }
      }
    }

    // Detect deleted/removed items to shrink/reflow their previous groups.
    for (const [itemId, prevGroupId] of previousAssignments) {
      if (!currentAssignments.has(itemId) && prevGroupId) {
        affectedGroupIds.add(prevGroupId);
        if (shouldDebug) {
          console.debug('[group-assignment]', {
            itemId,
            from: prevGroupId,
            to: null,
          });
        }
      }
    }

    // Seed baseline on first render to avoid startup collision side-effects.
    if (!hasInitializedGroupAssignmentsRef.current) {
      prevGroupAssignmentsRef.current = currentAssignments;
      hasInitializedGroupAssignmentsRef.current = true;
      return;
    }

    // Update ref for next comparison
    prevGroupAssignmentsRef.current = currentAssignments;

    // Resolve collisions for affected groups (skip on initial render)
    if (affectedGroupIds.size > 0 && groups.length > 0) {
      // Resolve collisions for each affected group
      for (const groupId of affectedGroupIds) {
        // Check if group still exists
        if (groups.some(g => g.id === groupId)) {
          void resolveCollisionsForGroup(groupId);
        }
      }
    }
  }, [plannedItems, groups, resolveCollisionsForGroup]);

  // When expanding a group, push overlapping groups out of the way
  useEffect(() => {
    const prevCollapsed = prevGroupCollapsedRef.current;
    const currentIds = new Set(groups.map(group => group.id));

    for (const group of groups) {
      const wasCollapsed = prevCollapsed.get(group.id);
      if (wasCollapsed === undefined) {
        prevCollapsed.set(group.id, group.is_collapsed);
        continue;
      }

      if (wasCollapsed && !group.is_collapsed) {
        void resolveCollisionsForGroup(group.id);
      }

      prevCollapsed.set(group.id, group.is_collapsed);
    }

    // Cleanup removed groups
    for (const id of prevCollapsed.keys()) {
      if (!currentIds.has(id)) {
        prevCollapsed.delete(id);
      }
    }
  }, [groups, resolveCollisionsForGroup]);

  // --- Derived data ---

  // Build tree hierarchy for tree view (using filtered items)
  const treeHierarchy = useMemo(() => buildHierarchyTree(filteredPlannedItems), [filteredPlannedItems]);

  // All filtered items for board view
  const leafItems = useMemo(
    () => filteredPlannedItems,
    [filteredPlannedItems]
  );



  // Initial fetch for this project: distinguish "still loading" from "empty plan"
  // so the view area doesn't render as a blank canvas while items load.
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
        {/* View area - Canvas, Tree, or Board */}
        <div className="flex-1 overflow-hidden" onContextMenu={handleContextMenu}>
          {viewMode === 'card' ? (
            <ErrorBoundary name="Canvas">
              <div className="h-full canvas-bg">
                <Canvas
                  projectId={currentProjectId}
                  items={filteredPlannedItems}
                  hierarchyTree={treeHierarchy}
                  selectedItemIds={selectedItemIds}
                  focusedItemId={focusedItemId}
                  searchQuery={searchQuery}
                  onSelectItem={handleSelectItem}
                  onSelectRange={handleSelectRange}
                  onEditItem={handleEditItem}
                  onPrepareEditItem={prefetchEditItem}
                  onAddToContext={handleAddItemToContextWithToast}
                  onCreateItem={handleCreateItemFromCanvas}
                  onReparent={handleReparent}
                  onUpdatePosition={updateItemPosition}
                  onUpdatePositions={updateItemPositions}
                  onAutoLayout={handleAutoLayout}
                  onAssignToGroup={handleAssignToGroup}
                />
              </div>
            </ErrorBoundary>
          ) : viewMode === 'tree' ? (
            <ErrorBoundary name="TreeView">
              <TreeView
                items={treeHierarchy}
                selectedIds={selectedItemIds}
                focusedItemId={focusedItemId}
                searchQuery={searchQuery}
                onSelectItem={handleSelectItem}
                onSelectRange={handleSelectRange}
                onEditItem={handleEditItem}
                onPrepareEditItem={prefetchEditItem}
                onContextMenu={handleTreeContextMenu}
                onReparent={handleReparent}
                onCreateItem={handleCreateItemFromTree}
              />
            </ErrorBoundary>
          ) : (
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
                onContextMenu={handleTreeContextMenu}
                onCreateItem={handleCreateItemFromBoard}
                onStartAgent={handleStartAgent}
                detailSessionId={boardDetailSessionId}
                onDetailSessionChange={setBoardDetailSessionId}
              />
            </ErrorBoundary>
          )}
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
          onOpenDetail={viewMode === 'board' ? setBoardDetailSessionId : undefined}
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
            canvasPosition={createItemContext.canvasPosition}
            planItems={planItems}
            onSubmit={handleCreateItemSubmit}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

// Export the openCreateItemModal function for Layout to use
export { type CreateItemData } from './CreateItemModal';
