import { useShallow } from 'zustand/react/shallow';

/**
 *
 * Note: This component directly calls the API instead of using useChat hook
 * to avoid registering duplicate event listeners when both Chat and NewSessionButton
 * are mounted simultaneously.
 */
    currentProjectId: state.currentProjectId,
  })));


    if (!currentProjectId) return;

  return (
      >
  );
}
