import { useCallback } from 'react';
import { useProjectDomainStore, useChatStore } from '../../stores';
import { startNewBackendChatSession } from '../../services/chatService';
import { useShallow } from 'zustand/react/shallow';
import { PlusIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';
import { HEADER_ICON_BUTTON } from './headerControls';

/**
 * Starts an additional chat session alongside the ones already open.
 *
 * Note: This component directly calls the API instead of using useChat hook
 * to avoid registering duplicate event listeners when both Chat and NewSessionButton
 * are mounted simultaneously.
 */
export function NewSessionButton() {
  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  const startNewChatSession = useChatStore((state) => state.startNewChatSession);

  const handleNewSession = useCallback(() => {
    if (!currentProjectId) return;

    // Open the tab immediately. Backend reset work must not make the header
    // control feel dead if IPC is slow or fails.
    startNewChatSession();

    void startNewBackendChatSession(currentProjectId).catch((error: unknown) => {
      console.error('[NewSessionButton] Failed to reset backend chat session:', error);
    });
  }, [currentProjectId, startNewChatSession]);

  return (
    <Tooltip content="New session">
      <button
        onClick={handleNewSession}
        disabled={!currentProjectId}
        className={HEADER_ICON_BUTTON}
        aria-label="New session"
      >
        <PlusIcon className="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  );
}
