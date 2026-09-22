import { useCallback, useEffect, useState } from 'react';
import type { CreateItemData } from '../CreateItemModal';
import type { PlanAction, StatusCategory } from '../../../../shared/types';
import type { ApplyPlanActionsResult } from '../../../stores/project/types';
import { buildCreateItemActions } from '../planItemFormActions';

interface CreateItemContext {
  isOpen: boolean;
  parentId: string | null;
  status: StatusCategory | null;
}

interface CreateItemModalDeps {
  executePlanActions: (actions: PlanAction[]) => Promise<ApplyPlanActionsResult>;
  registerCreateItemHandler?: ((handler: (() => void) | null) => void) | undefined;
}

export function useCreateItemModal({
  executePlanActions,
  registerCreateItemHandler,
}: CreateItemModalDeps) {
  const [createItemContext, setCreateItemContext] = useState<CreateItemContext | null>(null);

  // Open from TreeView (with optional parent)
  const handleCreateItemFromTree = useCallback((parentId: string | null) => {
    setCreateItemContext({
      isOpen: true,
      parentId,
      status: null,
    });
  }, []);

  // Open from BoardView (with status)
  const handleCreateItemFromBoard = useCallback((status: StatusCategory) => {
    setCreateItemContext({
      isOpen: true,
      parentId: null,
      status,
    });
  }, []);

  // Open from keyboard shortcut (no context)
  const openCreateItemModal = useCallback(() => {
    setCreateItemContext({
      isOpen: true,
      parentId: null,
      status: null,
    });
  }, []);

  // Register the create item handler with Layout for Cmd+Shift+I
  useEffect(() => {
    registerCreateItemHandler?.(openCreateItemModal);
    return () => registerCreateItemHandler?.(null);
  }, [registerCreateItemHandler, openCreateItemModal]);

  const closeCreateItemModal = useCallback(() => {
    setCreateItemContext(null);
  }, []);

  const handleCreateItemSubmit = useCallback(
    async (data: CreateItemData) => {
      const actions = buildCreateItemActions(data);
      await executePlanActions(actions);
    },
    [executePlanActions]
  );

  return {
    createItemContext,
    handleCreateItemFromTree,
    handleCreateItemFromBoard,
    closeCreateItemModal,
    handleCreateItemSubmit,
  };
}
