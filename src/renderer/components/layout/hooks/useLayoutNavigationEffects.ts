import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { StatusCategory } from '../../../../shared/types';
import { resolveStatusCategory } from '../../../constants/statusConfig';
import {
  emit,
  subscribe as subscribeToStoreEvent,
  useDevSessionsStore,
  usePlanDomainStore,
  useProjectUiDomainStore,
  useWorkspaceStore,
} from '../../../stores';
import { readWorkspaceFile } from '../../../services/workspaceFileService';
import { useChatStore } from '../../../stores/chat';
import { startPerfSpan } from '../../../utils/perfLogger';
import { scrollBehavior } from '../../../utils/reducedMotion';

interface UseLayoutNavigationEffectsParams {
  currentProjectId: string | null;
  hiddenStatusCategoriesRef: MutableRefObject<Set<StatusCategory>>;
  setHiddenStatusCategories: (categories: Set<StatusCategory>) => void;
  handleMainViewChange: (view: 'planning' | 'workspace') => void;
  showWorkspaceChat: () => void;
  showChatForCurrentView: () => void;
  hideChatForCurrentView: () => void;
}

export interface UseLayoutNavigationEffectsReturn {
  handleFileOpen: (source: string, path: string) => Promise<void>;
}

export function useLayoutNavigationEffects({
  currentProjectId,
  hiddenStatusCategoriesRef,
  setHiddenStatusCategories,
  handleMainViewChange,
  showWorkspaceChat,
  showChatForCurrentView,
  hideChatForCurrentView,
}: UseLayoutNavigationEffectsParams): UseLayoutNavigationEffectsReturn {
  const openDocument = useWorkspaceStore((state) => state.openDocument);

  const handleFileOpen = useCallback(
    async (source: string, path: string) => {
      const endOpen = startPerfSpan('workspace.file.open', { source, path });

      try {
        const content = await readWorkspaceFile(source, path, currentProjectId);
        endOpen({ contentLength: content.length });
        openDocument(source, path, content);
      } catch (error) {
        endOpen({ error: true });
        console.error('[Layout] Failed to open file:', error);
      }
    },
    [currentProjectId, openDocument]
  );

  useEffect(() => {
    const unsubscribe = subscribeToStoreEvent('navigate-to-view', (event) => {
      if (event.payload.view) {
        handleMainViewChange(event.payload.view);
      }

      if (event.payload.view === 'workspace' && event.payload.showChat) {
        showWorkspaceChat();
      }

      // A chat tab exists in both views, so reveal chat where the user already
      // is rather than moving them.
      if (event.payload.chatSessionId) {
        showChatForCurrentView();
        useChatStore.getState().setViewedSession(event.payload.chatSessionId);
      }

      // PlanView may not be mounted yet, so park the detail-pane request on the
      // store for it to adopt on mount.
      if (event.payload.view === 'planning' && event.payload.boardSessionId) {
        useDevSessionsStore.getState().setSelectedSessionId(event.payload.boardSessionId);
      }

      if (event.payload.view === 'workspace' && event.payload.filePath) {
        const filePath = event.payload.filePath;
        setTimeout(() => {
          void handleFileOpen('project', filePath);
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

        const effectiveStatus = resolveStatusCategory(item);
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

            element.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
            element.classList.add('plan-item-reveal');
            setTimeout(() => element.classList.remove('plan-item-reveal'), 2000);
          });
        });
      }
    });

    return unsubscribe;
  }, [handleFileOpen, handleMainViewChange, hiddenStatusCategoriesRef, setHiddenStatusCategories, showChatForCurrentView, showWorkspaceChat]);

  // The chat store deletes the tab; hiding the panel is the layout's call.
  useEffect(
    () => subscribeToStoreEvent('chat-tabs-emptied', hideChatForCurrentView),
    [hideChatForCurrentView]
  );

  return { handleFileOpen };
}
