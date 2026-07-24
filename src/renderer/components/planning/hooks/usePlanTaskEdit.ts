import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectUiDomainStore, useTrackerMetadataStore, useTrackerStore } from '../../../stores';
import type { PlanAction, PlanItem } from '../../../../shared/types';
import type { ApplyPlanActionsResult } from '../../../stores/project/types';
import type { PlanTaskEditDraft } from '../planItemFormActions';
import { buildPlanTaskEditActions } from '../planItemFormActions';

interface PlanTaskEditDeps {
  planItemsById: Map<string, PlanItem>;
  executePlanActions: (actions: PlanAction[]) => Promise<ApplyPlanActionsResult>;
}

export function usePlanTaskEdit({ planItemsById, executePlanActions }: PlanTaskEditDeps) {
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const associations = useTrackerStore((state) => state.associations);
  const loadIssueTypes = useTrackerMetadataStore((state) => state.loadIssueTypes);

  // Keep refs so callbacks don't need to close over these Maps/arrays, avoiding handleEditItem
  // recreation on every planItems change (which would defeat PlanCard.memo).
  const planItemsByIdRef = useRef(planItemsById);
  planItemsByIdRef.current = planItemsById;
  const associationsRef = useRef(associations);
  associationsRef.current = associations;

  const prefetchEditItem = useCallback((itemId: string) => {
    const item = planItemsByIdRef.current.get(itemId);
    if (!item?.association_id) return;

    const association = associationsRef.current.find((candidate) => candidate.id === item.association_id);
    if (!association?.project_key) return;

    // The issue-types endpoint dispatches on tracker type behind getClient(type),
    // so a Linear association resolves its own (synthetic) issue type rather than
    // being forced through the Jira client.
    void loadIssueTypes(association.project_key, association.tracker_type);
  }, [loadIssueTypes]);

  // Watch for editingItemId set by global search or other navigation
  const editingItemId = useProjectUiDomainStore((state) => state.editingItemId);
  useEffect(() => {
    if (editingItemId) {
      prefetchEditItem(editingItemId);
      const item = planItemsByIdRef.current.get(editingItemId);
      if (item) {
        setEditingItem(item);
      }
      useProjectUiDomainStore.getState().setEditingItemId(null);
    }
  }, [editingItemId, prefetchEditItem]);

  const handleEditItem = useCallback(
    (itemId: string) => {
      prefetchEditItem(itemId);
      const item = planItemsByIdRef.current.get(itemId);
      if (item) {
        setEditingItem(item);
      }
    },
    [prefetchEditItem]
  );

  const handleSaveTask = useCallback(
    async (draft: PlanTaskEditDraft) => {
      if (!editingItem) return;
      const actions = buildPlanTaskEditActions(editingItem, draft);
      const result = await executePlanActions(actions);
      if (result.error) throw new Error(result.error);
    },
    [editingItem, executePlanActions]
  );

  const closeEditModal = useCallback(() => setEditingItem(null), []);

  return {
    editingItem,
    handleEditItem,
    prefetchEditItem,
    handleSaveTask,
    closeEditModal,
  };
}
