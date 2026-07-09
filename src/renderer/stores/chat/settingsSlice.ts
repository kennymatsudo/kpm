import type { ChatState, ChatSet, ChatGet } from './types';
import { setAppSetting } from '../../services/settingsService';
import { getSlashCommands, getPiProviders } from '../../services/chatService';
import {
  findPiProviderOption,
  pickDefaultPiProviderOption,
  piProviderModelSelector,
  withAcknowledgedProvider,
} from './piProviderSelection';

/** Persisted key for the set of pi providers the user has acknowledged the "runs its own agent" warning for. */
export const PI_UNSAFE_ACK_SETTING_KEY = 'chat_pi_ack_unsafe_providers';

export function createSettingsSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
  | 'setTokens' | 'loadSlashCommands' | 'setSlashCommands' | 'setDefaultModel' | 'setModel' | 'setEffort'
  | 'loadPiProviders' | 'setDefaultProvider' | 'setProvider' | 'setDefaultCodexModel' | 'setCodexModel'
  | 'setDefaultPiProviderModel' | 'setPiProviderModel' | 'acknowledgeUnsafePiProvider'
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
    loadPiProviders: async () => {
      const result = await getPiProviders();
      if (!result.success) return;
      set({
        piProviders: result.providers,
        piProvidersAvailable: result.available,
        piProvidersLoaded: true,
      });

      // If there is no persisted selection that still resolves to a real
      // option, default to a safe one — never auto-select an unsafe provider.
      const state = get();
      if (findPiProviderOption(result.providers, state.piProviderModel)) return;
      const defaultOption = pickDefaultPiProviderOption(result.providers);
      if (defaultOption) {
        get().setDefaultPiProviderModel(piProviderModelSelector(defaultOption));
      }
    },
    setDefaultProvider: (provider) => {
      set({ provider });
      void setAppSetting('chat_provider', provider);
    },
    setProvider: (chatSessionId, provider) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) {
        set({ provider });
        void setAppSetting('chat_provider', provider);
        return;
      }
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, provider });
      // Update global default so new sessions inherit this choice
      set({ sessions, provider });
      void setAppSetting('chat_provider', provider);
    },
    setDefaultCodexModel: (codexModel) => {
      set({ codexModel });
      void setAppSetting('chat_codex_model', codexModel);
    },
    setCodexModel: (chatSessionId, codexModel) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) {
        set({ codexModel });
        void setAppSetting('chat_codex_model', codexModel);
        return;
      }
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, codexModel });
      // Update global default so new sessions inherit this choice
      set({ sessions, codexModel });
      void setAppSetting('chat_codex_model', codexModel);
    },
    setDefaultPiProviderModel: (piProviderModel) => {
      set({ piProviderModel });
      void setAppSetting('chat_pi_provider_model', piProviderModel ?? '');
    },
    setPiProviderModel: (chatSessionId, piProviderModel) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) {
        set({ piProviderModel });
        void setAppSetting('chat_pi_provider_model', piProviderModel ?? '');
        return;
      }
      const sessions = new Map(state.sessions);
      sessions.set(chatSessionId, { ...session, piProviderModel });
      // Update global default so new sessions inherit this choice
      set({ sessions, piProviderModel });
      void setAppSetting('chat_pi_provider_model', piProviderModel ?? '');
    },
    acknowledgeUnsafePiProvider: async (provider) => {
      const state = get();
      const next = withAcknowledgedProvider(state.piAcknowledgedUnsafeProviders, provider);
      if (next === state.piAcknowledgedUnsafeProviders) return;
      set({ piAcknowledgedUnsafeProviders: next });
      await setAppSetting(PI_UNSAFE_ACK_SETTING_KEY, JSON.stringify(Array.from(next)));
    },
  };
}
