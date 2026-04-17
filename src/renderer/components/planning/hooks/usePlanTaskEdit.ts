import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectUiDomainStore, useTrackerMetadataStore, useTrackerStore } from '../../../stores';

interface PlanTaskEditDeps {
  planItemsById: Map<string, PlanItem>;
  updatePlanItem: (id: string, updates: Record<string, unknown>) => Promise<void>;
}

export function usePlanTaskEdit({ planItemsById, updatePlanItem }: PlanTaskEditDeps) {
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

    void loadIssueTypes(association.project_key);
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
    async (updates: {
      title: string;
      description: string | null;
      label: string | null;
      intent?: string | null;
      acceptance_criteria?: string[] | null;
    }) => {
      if (!editingItem) return;
      await updatePlanItem(editingItem.id, updates);
    },
    [editingItem, updatePlanItem]
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
