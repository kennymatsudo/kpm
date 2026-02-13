import { useChatStore, useProjectDomainStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { CloseIcon } from '../icons';

/**
 * Session tabs showing all active and recent sessions.
 * Allows switching between sessions and closing them.
 */
export function SessionList() {
  const { currentProjectId } = useProjectDomainStore(useShallow((state) => ({
    currentProjectId: state.currentProjectId,
  })));

  const {
    setViewedSession,
    removeSession,

    return null;
  }

  const handleCloseSession = async (chatSessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentProjectId) return;


    // Remove session entirely (handles view switching internally)
    removeSession(chatSessionId);
  };

  return (



    </div>
  );
}
