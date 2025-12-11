import type { PlanSlice, SliceCreator } from './types';

export const createPlanSlice: SliceCreator<PlanSlice> = (deps) => (set, get) => ({
  updatePlanItems: (items) => set({ planItems: items }),

  setRelations: (relations) => set({ relations }),

  executePlanActions: async (actions) => {
    const { currentProjectId, refreshPlanItems, planItems } = get();
    if (!currentProjectId || actions.length === 0) return;

    // Optimistic update for reparent actions - update UI immediately
    const reparentActions = actions.filter(a => a.type === 'reparent') as { type: 'reparent'; item_id: string; new_parent_id: string | null }[];
    if (reparentActions.length > 0) {
      const reparentMap = new Map(reparentActions.map(a => [a.item_id, a.new_parent_id]));
      set({
        planItems: planItems.map(item =>
          reparentMap.has(item.id)
            ? { ...item, parent_id: reparentMap.get(item.id) ?? null }
            : item
        ),
      });
    }

    set({ error: null });
    try {
      const result = await deps.api.plan.executeActions(currentProjectId, actions);
      if (result.success) {
        const skipped = result.skippedActions ?? [];

        // Only do full refresh if there were non-reparent actions or skipped actions
        const hasNonReparentActions = actions.some(a => a.type !== 'reparent');
        const hasSkippedActions = skipped.length > 0;
        if (hasNonReparentActions || hasSkippedActions) {
          await refreshPlanItems();
        }

        // Surface skipped actions as warning so user knows why some didn't apply
        if (hasSkippedActions) {
          const applied = actions.length - skipped.length;
          const skippedSummary = skipped
            .map((s: { type: string; reason: string }) => `${s.type}: ${s.reason}`)
            .join('; ');
          set({ error: `${applied} action(s) applied, ${skipped.length} skipped: ${skippedSummary}` });
        }
      } else {
        // Revert optimistic update on failure
        await refreshPlanItems();
        set({ error: result.error || 'Failed to execute plan actions' });
      }
    } catch (error) {
      // Revert optimistic update on error
      await refreshPlanItems();
      set({ error: String(error) });
    }
  },

  addRelation: async (fromId, toId, type) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;

    set({ error: null });
    try {
      const relation = await deps.api.plan.addRelation({
        project_id: currentProjectId,
        from_item_id: fromId,
        to_item_id: toId,
        relation_type: type,
      });

      set((state) => ({
        relations: [...state.relations, relation],
      }));
    } catch (error) {
      const errorMessage = `Failed to add relation: ${String(error)}`;
      console.error(errorMessage);
      set({ error: errorMessage });
    }
  },

  removeRelation: async (relationId) => {
    set({ error: null });
    try {
      await deps.api.plan.removeRelation(relationId);
      set((state) => ({
        relations: state.relations.filter((r) => r.id !== relationId),
      }));
    } catch (error) {
      const errorMessage = `Failed to remove relation: ${String(error)}`;
      console.error(errorMessage);
      set({ error: errorMessage });
    }
  },

  updateItemPosition: async (itemId, x, y) => {
    // Round to integers - sub-pixel precision isn't meaningful for canvas positioning
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);

    // Update local state optimistically
    set((state) => ({
      planItems: state.planItems.map((item) =>
        item.id === itemId ? { ...item, position_x: roundedX, position_y: roundedY } : item
      ),
      error: null,
    }));
    try {
      const result = await deps.api.plan.updatePosition(itemId, roundedX, roundedY);
      if (!result.success) {
        // Revert optimistic update on failure
        const { refreshPlanItems } = get();
        await refreshPlanItems();
        set({ error: result.error || 'Failed to update item position' });
      }
    } catch (error) {
      const errorMessage = `Failed to update item position: ${String(error)}`;
      console.error(errorMessage);
      // Revert optimistic update on failure
      const { refreshPlanItems } = get();
      await refreshPlanItems();
      set({ error: errorMessage });
    }
  },

  updatePlanItem: async (itemId, updates) => {
    const { refreshPlanItems } = get();
    set({ error: null });
    try {
      const result = await deps.api.plan.updateItem(itemId, updates);
      if (!result.success) {
        set({ error: result.error || 'Failed to update plan item' });
        return;
      }
      await refreshPlanItems();
    } catch (error) {
      const errorMessage = `Failed to update plan item: ${String(error)}`;
      console.error(errorMessage);
      set({ error: errorMessage });
    }
  },

  updateStatusCategory: async (itemId, statusCategory) => {
    const { planItems, refreshPlanItems, currentProjectId } = get();
    const item = planItems.find((i) => i.id === itemId);
    if (!item) return;

    // Optimistic update
    set((state) => ({
      planItems: state.planItems.map((i) =>
        i.id === itemId ? { ...i, status_category: statusCategory } : i
      ),
      error: null,
    }));

    try {
      const result = await deps.api.plan.updateItem(itemId, { status_category: statusCategory });
      if (!result.success) {
        // Revert optimistic update
        await refreshPlanItems();
        set({ error: result.error || 'Failed to update status' });
        return;
      }

      // Emit event for export store to auto-queue for tracker sync
      }
    } catch (error) {
      const errorMessage = `Failed to update status: ${String(error)}`;
      console.error(errorMessage);
      await refreshPlanItems();
      set({ error: errorMessage });
    }
  },

  deletePlanItem: async (itemId) => {
    try {
      const result = await deps.api.plan.deleteItem(itemId);
      if (!result.success) {
        set({ error: result.error || 'Failed to delete plan item' });
        return;
      }
      await refreshPlanItems();
    } catch (error) {
      const errorMessage = `Failed to delete plan item: ${String(error)}`;
      console.error(errorMessage);
      set({ error: errorMessage });
    }
  },

  deletePlanItemWithDescendants: async (itemId) => {
    try {
      const result = await deps.api.plan.deleteItemWithDescendants(itemId);
      if (!result.success) {
        set({ error: result.error || 'Failed to delete plan item' });
        return;
      }
      await refreshPlanItems();
    } catch (error) {
      const errorMessage = `Failed to delete plan item with descendants: ${String(error)}`;
      console.error(errorMessage);
      set({ error: errorMessage });
    }
  },

  refreshPlanItems: async () => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;

    set({ isLoading: true, error: null });
    try {
      const [items, relations] = await Promise.all([
        deps.api.plan.listItems(currentProjectId),
        deps.api.plan.getRelations(currentProjectId),
      ]);

      set({
        planItems: items.map((item) => ({
          ...item,
          status: item.status || 'planned',
          release_tag: item.release_tag || null,
        })),
        relations,
      });
    } catch (error) {
      set({ error: `Failed to refresh plan items: ${String(error)}` });
    } finally {
      set({ isLoading: false });
    }
  },
});
