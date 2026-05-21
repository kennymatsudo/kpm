import type { ChatState, ChatSet, ChatGet } from './types';
import { setAppSetting } from '../../services/settingsService';

export function createSettingsSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
> {
  return {
    setTokens: (totalTokens) => set({ totalTokens }),
    setModel: (chatSessionId, model) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, model });
      // Update global default so new sessions inherit this choice
      set({ sessions, model });
    },
    setEffort: (chatSessionId, effort) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, effort });
      // Update global default so new sessions inherit this choice
      set({ sessions, effort });
    },
  };
}
