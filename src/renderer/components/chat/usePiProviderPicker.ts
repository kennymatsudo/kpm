import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores';
import type { PiProviderOption } from '../../../shared/types';
import {
  findPiProviderOption,
  piProviderModelSelector,
  requiresUnsafeAcknowledgment,
} from '../../stores/chat/piProviderSelection';

/**
 * Selection state and unsafe-acknowledgment flow for the pi.dev backend/model
 * picker in the composer. Scoped to the viewed session (falling back to the
 * global default before a session exists), mirroring how the Sonnet/Opus model
 * selector commits. Selecting a `safe: false` option that hasn't been
 * acknowledged yet stages it as `pendingUnsafeOption` instead of committing it
 * immediately — the caller renders a confirmation dialog and calls
 * `confirmPendingUnsafeSelection`/`cancelPendingUnsafeSelection` from it.
 */
export function usePiProviderPicker() {
  const {
    viewedSessionId,
    hasViewedSession,
    isStreaming,
    piProviders,
    piProviderModel,
    acknowledgedProviders,
    setPiProviderModel,
    setDefaultPiProviderModel,
    acknowledgeUnsafePiProvider,
  } = useChatStore(useShallow((state) => {
    const viewedSession = state.viewedSessionId
      ? state.sessions.get(state.viewedSessionId) ?? null
      : null;

    return {
      viewedSessionId: state.viewedSessionId,
      hasViewedSession: viewedSession !== null,
      isStreaming: viewedSession?.isStreaming ?? false,
      piProviders: state.piProviders,
      piProviderModel: viewedSession?.piProviderModel ?? state.piProviderModel,
      acknowledgedProviders: state.piAcknowledgedUnsafeProviders,
      setPiProviderModel: state.setPiProviderModel,
      setDefaultPiProviderModel: state.setDefaultPiProviderModel,
      acknowledgeUnsafePiProvider: state.acknowledgeUnsafePiProvider,
    };
  }));

  const [pendingUnsafeOption, setPendingUnsafeOption] = useState<PiProviderOption | null>(null);

  const selectedOption = useMemo(
    () => findPiProviderOption(piProviders, piProviderModel),
    [piProviders, piProviderModel],
  );

  const commitSelection = useCallback((option: PiProviderOption) => {
    const selector = piProviderModelSelector(option);
    if (viewedSessionId && hasViewedSession) {
      setPiProviderModel(viewedSessionId, selector);
    } else {
      setDefaultPiProviderModel(selector);
    }
  }, [viewedSessionId, hasViewedSession, setPiProviderModel, setDefaultPiProviderModel]);

  const selectOption = useCallback((option: PiProviderOption) => {
    if (requiresUnsafeAcknowledgment(option, acknowledgedProviders)) {
      setPendingUnsafeOption(option);
      return;
    }
    commitSelection(option);
  }, [acknowledgedProviders, commitSelection]);

  const confirmPendingUnsafeSelection = useCallback(async () => {
    if (!pendingUnsafeOption) return;
    await acknowledgeUnsafePiProvider(pendingUnsafeOption.provider);
    commitSelection(pendingUnsafeOption);
    setPendingUnsafeOption(null);
  }, [pendingUnsafeOption, acknowledgeUnsafePiProvider, commitSelection]);

  const cancelPendingUnsafeSelection = useCallback(() => setPendingUnsafeOption(null), []);

  return {
    piProviders,
    selectedOption,
    pendingUnsafeOption,
    isStreaming,
    selectOption,
    confirmPendingUnsafeSelection,
    cancelPendingUnsafeSelection,
  };
}
