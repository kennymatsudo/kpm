import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { StatusCategory } from '../../../../shared/types';
import { getStatusCategory } from '../../../constants/statusConfig';
import {
  emit,
  subscribe as subscribeToStoreEvent,
  usePlanDomainStore,
  useProjectUiDomainStore,
  useWorkspaceStore,
} from '../../../stores';
import { readWorkspaceFile } from '../../../services/workspaceFileService';
import { startPerfSpan } from '../../../utils/perfLogger';

interface UseLayoutNavigationEffectsParams {
  currentProjectId: string | null;
  hiddenStatusCategoriesRef: MutableRefObject<Set<StatusCategory>>;
  setHiddenStatusCategories: (categories: Set<StatusCategory>) => void;
  handleMainViewChange: (view: 'planning' | 'workspace') => void;
}

export interface UseLayoutNavigationEffectsReturn {
  handleFileOpen: (source: string, path: string, isEditable: boolean) => Promise<void>;
}

export function useLayoutNavigationEffects({
  currentProjectId,
  hiddenStatusCategoriesRef,
  setHiddenStatusCategories,
  handleMainViewChange,
}: UseLayoutNavigationEffectsParams): UseLayoutNavigationEffectsReturn {
  const openFile = useWorkspaceStore((state) => state.openFile);

  const handleFileOpen = useCallback(
    async (source: string, path: string, isEditable: boolean) => {
      const endOpen = startPerfSpan('workspace.file.open', {
        source,
        path,
        editable: isEditable,
      });

      try {
        const content = await readWorkspaceFile(source, path, currentProjectId);
        endOpen({ contentLength: content.length });
        openFile(source, path, content, !isEditable);
      } catch (error) {
        endOpen({ error: true });
        console.error('[Layout] Failed to open file:', error);
      }
    },
    [currentProjectId, openFile]
  );

  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('navigate-to-view', (event) => {
      handleMainViewChange(event.payload.view);

      if (event.payload.view === 'workspace' && event.payload.filePath) {
        const filePath = event.payload.filePath;
        setTimeout(() => {
          void handleFileOpen('project', filePath, true);
        }, 50);
      }

      if (event.payload.view === 'planning' && event.payload.planItemId) {
        const itemId = event.payload.planItemId;
        const allItems = usePlanDomainStore.getState().planItems;
        const item = allItems.find((candidate) => candidate.id === itemId && candidate.status === 'planned');

        if (!item) return;

        setTimeout(() => {
          useProjectUiDomainStore.getState().setEditingItemId(itemId);
        }, 100);

        const effectiveStatus = item.status_category
          ?? getStatusCategory(item.external_status, item.external_type);
        const currentHidden = hiddenStatusCategoriesRef.current;
        const isHiddenByFilter = effectiveStatus != null && currentHidden.has(effectiveStatus);

        if (!isHiddenByFilter || !effectiveStatus) return;

        const next = new Set(currentHidden);
        next.delete(effectiveStatus);
        setHiddenStatusCategories(next);

        if (effectiveStatus === 'blocked' || effectiveStatus === 'canceled') {
          emit({ type: 'reveal-board-column', payload: { status: effectiveStatus } });
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const element = document.querySelector(`[data-plan-item-id="${itemId}"]`);
            if (!element) return;

            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('plan-item-reveal');
            setTimeout(() => element.classList.remove('plan-item-reveal'), 2000);
          });
        });
      }
    });

    return unsubscribe;

  return { handleFileOpen };
}
