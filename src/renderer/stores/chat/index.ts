import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ChatState } from './types';
import { createInitialChatState } from './baseState';
import { createSessionManagementSlice } from './sessionManagementSlice';
import { createStreamingSlice } from './streamingSlice';
import { createMessageSlice } from './messageSlice';
import { createHistorySlice } from './historySlice';
import { createSettingsSlice } from './settingsSlice';
import { getOptionalSetting, getSetting, getProviderReadiness } from '../../services/settingsService';
import { writePersistedTabs } from './persistence';
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
  void getSetting('chatModel').then((model) => useChatStore.setState({ model }));
  void getSetting('chatEffort').then((effort) => useChatStore.setState({ effort }));
  // Resolve the effective provider from the user's stored choice and what's
  // actually ready — never fall back to a hardcoded provider. A deliberate
  // choice that is ready is kept; otherwise adopt a single ready provider, or
  // leave the initial default in place for the connect step to resolve. This
  // read uses the null-distinguishing stored form, not the default-folding
  // registry codec, so "no choice yet" stays distinct from an explicit claude.
  void Promise.all([getOptionalSetting('chatProvider'), getProviderReadiness()]).then(([stored, readinessResult]) => {
    const storedChoice = getStoredChatProvider(stored);
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
  void getSetting('chatCodexModel').then((codexModel) => useChatStore.setState({ codexModel }));
  void getSetting('chatPiProviderModel').then((piProviderModel) => {
    if (piProviderModel) useChatStore.setState({ piProviderModel });
  });
  void getSetting('chatPiAckUnsafeProviders').then((piAcknowledgedUnsafeProviders) => {
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
