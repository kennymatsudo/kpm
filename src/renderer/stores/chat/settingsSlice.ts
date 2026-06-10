import type { ChatState, ChatSet, ChatGet } from './types';
import { setAppSetting } from '../../services/settingsService';
import { getSlashCommands } from '../../services/chatService';

export function createSettingsSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
  'setTokens' | 'loadSlashCommands' | 'setSlashCommands' | 'setDefaultModel' | 'setModel' | 'setEffort'
> {
  return {
    setTokens: (totalTokens) => set({ totalTokens }),
    loadSlashCommands: async () => {
      const result = await getSlashCommands();
      // Re-check the source after the await: an SDK list may have landed
      // mid-fetch, and the scan must never overwrite it.
      if (result.success && result.commands && get().slashCommandsSource === 'scan') {
        set({ slashCommands: result.commands });
      }
    },
    setSlashCommands: (slashCommands) => set({ slashCommands, slashCommandsSource: 'sdk' }),
    setDefaultModel: (model) => {
      set({ model });
      void setAppSetting('chat_model', model);
    },
    setModel: (chatSessionId, model) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) {
        set({ model });
        void setAppSetting('chat_model', model);
        return;
      }
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, model });
      // Update global default so new sessions inherit this choice
      set({ sessions, model });
      void setAppSetting('chat_model', model);
    },
    setEffort: (chatSessionId, effort) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, effort });
      // Update global default so new sessions inherit this choice
      set({ sessions, effort });
      void setAppSetting('chat_effort', effort);
    },
  };
}
