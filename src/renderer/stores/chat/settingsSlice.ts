import type { ChatState, ChatSet, ChatGet } from './types';
import { setSetting } from '../../services/settingsService';
import { changeChatChoice as persistChatChoiceChange, getSlashCommands, getPiProviders, openChatChoice as persistChatChoiceOpen } from '../../services/chatService';
import type { ChatChoiceView } from '../../../shared/types';
import {
  findPiProviderOption,
  pickDefaultPiProviderOption,
  piProviderModelSelector,
  withAcknowledgedProvider,
} from './piProviderSelection';

const PI_RETRY_MAX_ATTEMPTS = 5;
const PI_RETRY_BASE_DELAY_MS = 2000;
const PI_RETRY_MAX_DELAY_MS = 30000;
let piRetryTimer: ReturnType<typeof setTimeout> | null = null;
let piRetryAttempts = 0;

function clearPiRetry() {
  if (piRetryTimer) {
    clearTimeout(piRetryTimer);
    piRetryTimer = null;
  }
}

export function createSettingsSlice(set: ChatSet, get: ChatGet): Pick<ChatState,
  | 'setTokens' | 'loadSlashCommands' | 'setSlashCommands' | 'setDefaultModel' | 'setDefaultEffort' | 'setModel' | 'setEffort'
  | 'loadPiProviders' | 'setDefaultProvider' | 'setProvider' | 'setDefaultCodexModel' | 'setCodexModel'
  | 'setDefaultPiProviderModel' | 'setPiProviderModel' | 'acknowledgeUnsafePiProvider'
  | 'setChatChoice' | 'openChatChoice' | 'changeChatChoice'
> {
  const rememberProvider = (provider: ChatState['provider']) => {
    set({ provider });
    void setSetting('chatProvider', provider);
  };

  const setChatChoice = (chatSessionId: string, choice: ChatChoiceView) => {
    const state = get();
    const session = state.sessions.get(chatSessionId);
    if (!session) return;
    const sessions = new Map(state.sessions);
    sessions.set(chatSessionId, { ...session, choice });
    set({ sessions, provider: choice.selected.provider });
    void setSetting('chatProvider', choice.selected.provider);
  };

  const changeChoice = async (chatSessionId: string, intent: Parameters<ChatState['changeChatChoice']>[1]) => {
    const state = get();
    const session = state.sessions.get(chatSessionId);
    if (!session?.choice || !state.persistedProjectId) return;
    const result = await persistChatChoiceChange({
      projectId: state.persistedProjectId,
      chatSessionId,
      expectedRevision: session.choice.revision,
      intent,
    });
    if (result.success && result.choice) {
      setChatChoice(chatSessionId, result.choice);
    } else {
      const sessions = new Map(get().sessions);
      const current = sessions.get(chatSessionId);
      if (current) sessions.set(chatSessionId, { ...current, error: 'error' in result ? result.error : 'Failed to change Chat model choice' });
      set({ sessions });
    }
  };

  return {
    setTokens: (totalTokens) => set({ totalTokens }),
    setChatChoice,
    openChatChoice: async (projectId, chatSessionId) => {
      const result = await persistChatChoiceOpen(projectId, chatSessionId);
      if (result.success && result.choice) {
        setChatChoice(chatSessionId, result.choice);
        return result.choice;
      }
      const session = get().sessions.get(chatSessionId);
      if (session) {
        const sessions = new Map(get().sessions);
        sessions.set(chatSessionId, { ...session, error: 'error' in result ? result.error : 'Failed to open Chat model choice' });
        set({ sessions });
      }
      return null;
    },
    changeChatChoice: changeChoice,
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
      void setSetting('chatModel', model);
    },
    setDefaultEffort: (effort) => {
      set({ effort });
      void setSetting('chatEffort', effort);
    },
    setModel: (chatSessionId, model) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      void changeChoice(chatSessionId, { type: 'choose_model', model });
    },
    setEffort: (chatSessionId, effort) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      void changeChoice(chatSessionId, { type: 'choose_effort', effort });
    },
    loadPiProviders: async () => {
      const result = await getPiProviders();
      if (!result.success) return;
      set({
        piProviders: result.providers,
        piProvidersAvailable: result.available,
        piProvidersLoaded: true,
      });

      if (result.available && result.providers.length === 0) {
        if (piRetryAttempts < PI_RETRY_MAX_ATTEMPTS) {
          const delay = Math.min(PI_RETRY_BASE_DELAY_MS * 2 ** piRetryAttempts, PI_RETRY_MAX_DELAY_MS);
          piRetryAttempts += 1;
          clearPiRetry();
          piRetryTimer = setTimeout(() => { void get().loadPiProviders(); }, delay);
        }
        return;
      }
      piRetryAttempts = 0;
      clearPiRetry();

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
      rememberProvider(provider);
    },
    setProvider: (chatSessionId, provider) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      void changeChoice(chatSessionId, { type: 'choose_provider', provider });
    },
    setDefaultCodexModel: (codexModel) => {
      set({ codexModel });
      void setSetting('chatCodexModel', codexModel);
    },
    setCodexModel: (chatSessionId, codexModel) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      void changeChoice(chatSessionId, { type: 'choose_model', model: codexModel });
    },
    setDefaultPiProviderModel: (piProviderModel) => {
      set({ piProviderModel });
      void setSetting('chatPiProviderModel', piProviderModel ?? null);
    },
    setPiProviderModel: (chatSessionId, piProviderModel) => {
      const state = get();
      const session = state.sessions.get(chatSessionId);
      if (!session) return;
      if (piProviderModel) void changeChoice(chatSessionId, { type: 'choose_model', model: piProviderModel });
    },
    acknowledgeUnsafePiProvider: async (provider) => {
      const state = get();
      const next = withAcknowledgedProvider(state.piAcknowledgedUnsafeProviders, provider);
      if (next === state.piAcknowledgedUnsafeProviders) return;
      set({ piAcknowledgedUnsafeProviders: next });
      await setSetting('chatPiAckUnsafeProviders', next);
    },
  };
}
