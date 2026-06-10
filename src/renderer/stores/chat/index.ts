import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ChatState } from './types';
import { createInitialChatState } from './baseState';
import { createSessionManagementSlice } from './sessionManagementSlice';
import { createStreamingSlice } from './streamingSlice';
import { createMessageSlice } from './messageSlice';
import { createHistorySlice } from './historySlice';
import { createSettingsSlice } from './settingsSlice';
import { getAppSetting } from '../../services/settingsService';
import { writePersistedTabs } from './persistence';

export const useChatStore: UseBoundStore<StoreApi<ChatState>> = create<ChatState>((set, get) => ({
  ...createInitialChatState(),
  ...createSessionManagementSlice(set, get),
  ...createStreamingSlice(set, get),
  ...createMessageSlice(set, get),
  ...createHistorySlice(set, get),
  ...createSettingsSlice(set, get),

  getViewedSession: () => {
    const state = get();
    if (!state.viewedSessionId) return null;
    return state.sessions.get(state.viewedSessionId) ?? null;
  },
}));

// Load persisted model and effort preferences (guarded for Node.js test environments)
if (typeof window !== 'undefined') {
  void useChatStore.getState().loadSlashCommands();
  void getAppSetting('chat_model').then((result: { success: boolean; value?: string }) => {
    if (result.value === 'sonnet' || result.value === 'opus') {
      useChatStore.setState({ model: result.value });
    }
  });
  void getAppSetting('chat_effort').then((result: { success: boolean; value?: string }) => {
    if (result.value === 'high' || result.value === 'max') {
      useChatStore.setState({ effort: result.value });
    }
  });
}

// Persist open-tab state to localStorage on every change. The previous
// snapshot is captured per-subscription tick so we only write when the tab
// set or focused tab actually changes — streaming chunks and activity bumps
// mutate per-session state constantly but don't affect tab persistence.
let prevTabSignature = '';
useChatStore.subscribe((state) => {
  if (!state.persistedProjectId) return;
  const ids = Array.from(state.sessions.keys());
  const signature = `${ids.join(',')}|${state.viewedSessionId ?? ''}`;
  if (signature === prevTabSignature) return;
  prevTabSignature = signature;
  writePersistedTabs(state.persistedProjectId, {
    open: ids,
    viewed: state.viewedSessionId,
  });
});

// Re-export types
