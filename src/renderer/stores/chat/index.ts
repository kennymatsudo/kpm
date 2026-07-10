import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ChatState } from './types';
import { createInitialChatState } from './baseState';
import { createSessionManagementSlice } from './sessionManagementSlice';
import { createStreamingSlice } from './streamingSlice';
import { createMessageSlice } from './messageSlice';
import { createHistorySlice } from './historySlice';
import { createSettingsSlice } from './settingsSlice';
import { getAppSetting, getSetting, getProviderReadiness } from '../../services/settingsService';
import { writePersistedTabs } from './persistence';
import { SETTINGS } from '../../../shared/settingsRegistry';
import { getStoredChatProvider } from '../../../shared/appSettings';
import { resolveEffectiveProvider } from '../../../shared/providerResolution';

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
  void getSetting(SETTINGS.chatModel).then((model) => useChatStore.setState({ model }));
  void getSetting(SETTINGS.chatEffort).then((effort) => useChatStore.setState({ effort }));
  // Resolve the effective provider from the user's stored choice and what's
  // actually ready — never fall back to a hardcoded provider. A deliberate
  // choice that is ready is kept; otherwise adopt a single ready provider, or
  // leave the initial default in place for the connect step to resolve. This
  // read uses the null-distinguishing stored form, not the default-folding
  // registry codec, so "no choice yet" stays distinct from an explicit claude.
  void Promise.all([getAppSetting(SETTINGS.chatProvider.key), getProviderReadiness()]).then(([stored, readinessResult]) => {
    const storedChoice = stored.success ? getStoredChatProvider(stored.value) : null;
    if (!readinessResult.success) {
      if (storedChoice) useChatStore.setState({ provider: storedChoice });
      return;
    }
    const { success: _success, ...readiness } = readinessResult;
    const { provider } = resolveEffectiveProvider(readiness, storedChoice);
    if (provider) {
      useChatStore.setState({ provider });
    }
  });
  void getSetting(SETTINGS.chatCodexModel).then((codexModel) => useChatStore.setState({ codexModel }));
  void getSetting(SETTINGS.chatPiProviderModel).then((piProviderModel) => {
    if (piProviderModel) useChatStore.setState({ piProviderModel });
  });
  void getSetting(SETTINGS.chatPiAckUnsafeProviders).then((piAcknowledgedUnsafeProviders) => {
    if (piAcknowledgedUnsafeProviders.size > 0) {
      useChatStore.setState({ piAcknowledgedUnsafeProviders });
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
