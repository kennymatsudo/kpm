import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ChatProvider, ProviderReadiness } from '../../../shared/types';
import { CHAT_PROVIDERS } from '../../../shared/types';
import { useProviderReadinessStore } from '../../stores';
import { useChatStore } from '../../stores/chat';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';

interface ProviderPresentation {
  label: string;
  description: string;
  /** How to connect when not yet configured. */
  connectHint: string;
}

const PROVIDER_PRESENTATION: Record<ChatProvider, ProviderPresentation> = {
  claude: {
    label: 'Claude',
    description: 'Fast, balanced coding agent',
    connectHint: 'Run /login in the claude CLI',
  },
  codex: {
    label: 'Codex',
    description: "OpenAI's coding agent",
    connectHint: 'Run codex login in your terminal',
  },
  pi: {
    label: 'pi',
    description: 'Bring your own provider',
    connectHint: 'Run pi auth in your terminal',
  },
};

interface ConnectAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectAgentModal({ isOpen, onClose }: ConnectAgentModalProps) {
  const { readiness, isLoading, load, refresh } = useProviderReadinessStore();
  const { provider: defaultProvider, setDefaultProvider } = useChatStore(
    useShallow((state) => ({
      provider: state.provider,
      setDefaultProvider: state.setDefaultProvider,
    })),
  );

  useEffect(() => {
    if (isOpen && !readiness && !isLoading) {
      void load();
    }
  }, [isOpen, readiness, isLoading, load]);

  const handleDone = useCallback(async () => {
    const next = await refresh();
    if (next?.anyReady) {
      onClose();
    }
  }, [refresh, onClose]);

  const anyReady = readiness?.anyReady ?? false;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" aria-labelledby="connect-agent-title">
      <ModalHeader
        id="connect-agent-title"
        onClose={onClose}
        subtitle="KPM uses a coding agent to power chat and board execution."
      >
        Connect a coding agent
      </ModalHeader>
      <ModalBody>
        <div role="radiogroup" aria-label="Coding agent" className="grid grid-cols-3 gap-2">
          {CHAT_PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              readiness={readiness?.byProvider[provider] ?? null}
              isDefault={defaultProvider === provider}
              onSelect={() => setDefaultProvider(provider)}
            />
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto text-xs text-text-muted">
          {anyReady ? 'Ready to go — click a connected agent to make it your default.' : 'Connect an agent, then click Done.'}
        </span>
        <button
          onClick={() => void refresh()}
          disabled={isLoading}
          className="rounded-md bg-surface-2 border border-border-subtle hover:border-border-default px-3 py-1.5 text-[12px] text-text-secondary transition-colors disabled:opacity-60"
        >
          {isLoading ? <LoadingSpinner className="w-3.5 h-3.5" /> : 'Recheck'}
        </button>
        <button
          onClick={() => void handleDone()}
          className="rounded-md bg-accent text-surface-0 hover:bg-accent/90 px-3 py-1.5 text-[12px] font-medium transition-colors"
        >
          Done
        </button>
      </ModalFooter>
    </Modal>
  );
}

function ProviderCard({
  provider,
  readiness,
  isDefault,
  onSelect,
}: {
  provider: ChatProvider;
  readiness: ProviderReadiness | null;
  isDefault: boolean;
  onSelect: () => void;
}) {
  const presentation = PROVIDER_PRESENTATION[provider];
  const isReady = readiness?.state === 'ready';
  const dotClassName = isReady ? 'bg-success' : 'bg-warning';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isDefault}
      disabled={!isReady}
      onClick={onSelect}
      className={`
        relative rounded-lg border px-3 py-2.5 text-left transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
        ${!isReady
          ? 'cursor-default border-border-subtle bg-surface-2/40'
          : isDefault
            ? 'border-accent bg-accent-subtle'
            : 'border-border-subtle bg-surface-2/60 hover:border-border-default hover:bg-surface-3/50'
        }
      `}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClassName}`} />
        <span className={`text-sm font-medium ${isDefault ? 'text-accent' : 'text-text-primary'}`}>
          {presentation.label}
        </span>
      </div>
      <span className="mt-0.5 block text-xs text-text-muted">{presentation.description}</span>
      <span className="mt-1.5 block text-xs text-text-secondary">
        {isReady ? (readiness?.detail ?? 'Ready') : presentation.connectHint}
      </span>
    </button>
  );
}
