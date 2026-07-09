import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ChatState } from './types';
import { createInitialChatState } from './baseState';
import { createSessionManagementSlice } from './sessionManagementSlice';
import { createStreamingSlice } from './streamingSlice';
import { createMessageSlice } from './messageSlice';
import { createHistorySlice } from './historySlice';
import { createSettingsSlice, PI_UNSAFE_ACK_SETTING_KEY } from './settingsSlice';
import { getAppSetting } from '../../services/settingsService';
import { writePersistedTabs } from './persistence';
import { CHAT_PROVIDERS, CODEX_CHAT_MODELS } from '../../../shared/types';

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
  void getAppSetting('chat_model').then((result) => {
    if (!result.success) return;
    if (result.value === 'sonnet' || result.value === 'opus') {
      useChatStore.setState({ model: result.value });
    }
  });
  void getAppSetting('chat_effort').then((result) => {
    if (!result.success) return;
    if (result.value === 'high' || result.value === 'max') {
      useChatStore.setState({ effort: result.value });
    }
  });
  void getAppSetting('chat_provider').then((result) => {
    if (!result.success || !result.value) return;
    if ((CHAT_PROVIDERS as readonly string[]).includes(result.value)) {
      useChatStore.setState({ provider: result.value as (typeof CHAT_PROVIDERS)[number] });
    }
  });
  void getAppSetting('chat_codex_model').then((result) => {
    if (!result.success || !result.value) return;
    if (CODEX_CHAT_MODELS.some((option) => option.value === result.value)) {
      useChatStore.setState({ codexModel: result.value as (typeof CODEX_CHAT_MODELS)[number]['value'] });
    }
  });
  void getAppSetting('chat_pi_provider_model').then((result) => {
    if (!result.success || !result.value) return;
    useChatStore.setState({ piProviderModel: result.value });
  });
  void getAppSetting(PI_UNSAFE_ACK_SETTING_KEY).then((result) => {
    if (!result.success || !result.value) return;
    try {
      const parsed: unknown = JSON.parse(result.value);
      if (Array.isArray(parsed)) {
        const providers = parsed.filter((entry): entry is string => typeof entry === 'string');
        useChatStore.setState({ piAcknowledgedUnsafeProviders: new Set(providers) });
      }
    } catch {
      // Malformed persisted value — ignore and keep the empty default.
    }
  });
  void useChatStore.getState().loadPiProviders();
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
export type { Message, PerSessionState, ChatState, Activity, ClaudeModel, ChatProvider, PiProviderOption, MessageSegment, AgentEffortLevel, CodexChatModel } from './types';
