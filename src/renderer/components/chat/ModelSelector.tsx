import { useChatStore, type ChatClaudeModel, type CodexChatModel } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { CODEX_CHAT_MODELS } from '../../../shared/types';
import { getProviderCapabilities } from '../../../shared/providerCapabilities';
import { PiModelPicker } from './PiModelPicker';

const MODELS: { value: ChatClaudeModel; label: string; description: string }[] = [
  { value: 'sonnet', label: 'Sonnet', description: 'Claude Sonnet — Fast, balanced' },
  { value: 'opus', label: 'Opus', description: 'Claude Opus — Most capable' },
];

export function ModelSelector() {
  const {
    viewedSessionId,
    hasViewedSession,
    provider,
    model,
    codexModel,
    messageCount,
    setDefaultModel,
    setModel,
    setDefaultCodexModel,
    setCodexModel,
    isStreaming,
  } = useChatStore(useShallow((state) => {
    const viewedSession = state.viewedSessionId
      ? state.sessions.get(state.viewedSessionId) ?? null
      : null;

    return {
      viewedSessionId: state.viewedSessionId,
      hasViewedSession: viewedSession !== null,
      provider: viewedSession?.provider ?? state.provider,
      model: viewedSession?.model ?? state.model,
      codexModel: viewedSession?.codexModel ?? state.codexModel,
      messageCount: viewedSession?.messages.length ?? 0,
      setDefaultModel: state.setDefaultModel,
      setModel: state.setModel,
      setDefaultCodexModel: state.setDefaultCodexModel,
      setCodexModel: state.setCodexModel,
      isStreaming: viewedSession?.isStreaming ?? false,
    };
  }));

  const handleModelChange = (newModel: ChatClaudeModel, e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewedSessionId && hasViewedSession) {
      setModel(viewedSessionId, newModel);
    } else {
      setDefaultModel(newModel);
    }
  };

  const handleCodexModelChange = (newModel: CodexChatModel, e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewedSessionId && hasViewedSession) {
      setCodexModel(viewedSessionId, newModel);
    } else {
      setDefaultCodexModel(newModel);
    }
  };

  const capabilities = getProviderCapabilities(provider);
  if (viewedSessionId && hasViewedSession && messageCount > 0 && !capabilities.midSessionModelSwitch) {
    return null;
  }

  // The composer's model control adapts to the active provider: pi has its own
  // backend/model picker, Codex gets its supported model list, and Claude gets
  // the Sonnet/Opus toggle below.
  if (provider === 'pi') return <PiModelPicker />;
  if (provider === 'codex') {
    return (
      <div
        className={`
          inline-flex items-center rounded-lg p-0.5
          bg-surface-2
          ${isStreaming ? 'opacity-40 pointer-events-none' : ''}
        `}
      >
        {CODEX_CHAT_MODELS.map((m) => {
          const isSelected = codexModel === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={(e) => handleCodexModelChange(m.value, e)}
              disabled={isStreaming}
              className={`
                flex-1 text-center px-3 py-1 text-tiny font-medium
                transition-colors duration-150 rounded-md
                cursor-pointer whitespace-nowrap
                disabled:cursor-not-allowed disabled:opacity-50
                ${isSelected
                  ? 'bg-accent text-white font-semibold'
                  : 'text-text-tertiary hover:text-text-secondary'
                }
              `}
              title={m.description}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (provider !== 'claude') return null;

  return (
    <div
      className={`
        inline-flex items-center rounded-lg p-0.5
        bg-surface-2
        ${isStreaming ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      {MODELS.map((m) => {
        const isSelected = model === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={(e) => handleModelChange(m.value, e)}
            disabled={isStreaming}
            className={`
              flex-1 text-center px-3 py-1 text-tiny font-medium
              transition-colors duration-150 rounded-md
              cursor-pointer
              disabled:cursor-not-allowed disabled:opacity-50
              ${isSelected
                ? 'bg-accent text-white font-semibold'
                : 'text-text-tertiary hover:text-text-secondary'
              }
            `}
            title={m.description}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
