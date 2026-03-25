import { useProjectUiDomainStore, useTrackerMetadataStore, useTrackerStore } from '../../../stores';

interface PlanTaskEditDeps {
  planItemsById: Map<string, PlanItem>;
  updatePlanItem: (id: string, updates: Record<string, unknown>) => Promise<void>;
}

export function usePlanTaskEdit({ planItemsById, updatePlanItem }: PlanTaskEditDeps) {
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const associations = useTrackerStore((state) => state.associations);
  const loadIssueTypes = useTrackerMetadataStore((state) => state.loadIssueTypes);

  const prefetchEditItem = useCallback((itemId: string) => {
    if (!item?.association_id) return;

    if (!association?.project_key) return;

    void loadIssueTypes(association.project_key);

  // Watch for editingItemId set by global search or other navigation
  const editingItemId = useProjectUiDomainStore((state) => state.editingItemId);
  useEffect(() => {
    if (editingItemId) {
      prefetchEditItem(editingItemId);
      if (item) {
        setEditingItem(item);
      }
      useProjectUiDomainStore.getState().setEditingItemId(null);
    }

  const handleEditItem = useCallback(
    (itemId: string) => {
      prefetchEditItem(itemId);
      if (item) {
        setEditingItem(item);
      }
    },
  );

  const handleSaveTask = useCallback(
    async (updates: {
      title: string;
      description: string | null;
      label: string | null;
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
