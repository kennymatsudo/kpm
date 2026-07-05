import { useEffect } from 'react';
import { useChatStore, useApprovalQueueStore, useGeneralSettingsStore } from '../stores';
import { emit } from '../stores/storeEvents';
import {
  getActiveChatSessions,
  getChatSessionState,
  getChatUsage,
  subscribeToChatEvents,
} from '../services/chatService';
import { createChatEventRouter, WATCHDOG_POLL_MS } from './chatEventRouter';

/**
 * Bridge hook that registers ALL chat IPC listeners at the Layout level.
 *
 * Previously these listeners lived inside `useChat`, which only mounted when
 * the Chat component was rendered. When the user switched to the Development
 * view (no Chat component), events like `onFileUpdate` and `onPlanActions`
 * were silently dropped, causing approval modals to never appear.
 *
 * By calling this hook from Layout (always mounted), events are captured
 * regardless of the active view.
 *
 * All routing, buffering, and watchdog behaviour lives in
 * `createChatEventRouter`; this hook only adapts it to the React lifecycle.
 */
export function useChatIpcBridge(projectId: string | null): void {
  useEffect(() => {
    if (!projectId) return;

    const router = createChatEventRouter({
      projectId,
      getChatState: () => useChatStore.getState(),
      getApprovalQueue: () => useApprovalQueueStore.getState(),
      services: { getChatUsage, getActiveChatSessions, getChatSessionState },
      emitStoreEvent: emit,
      now: Date.now,
    });

    void useGeneralSettingsStore.getState().loadApprovalMode();
    void router.initialize();

    const unsubscribeChatEvents = subscribeToChatEvents(router.handlers);
    const watchdogInterval = setInterval(() => {
      void router.tick();
    }, WATCHDOG_POLL_MS);

    return () => {
      router.dispose();
      clearInterval(watchdogInterval);
      unsubscribeChatEvents();
    };
  }, [projectId]);
}
