import { useCallback, useEffect } from 'react';
import {
  getConversationWriteGrant,
  revokeConversationWriteGrant,
} from '../../services/permissionService';
import { usePermissionStore } from '../../stores';

export function useWriteGrant(chatSessionId: string | null): {
  writesEnabled: boolean;
  revoke: () => void;
} {
  const writesEnabled = usePermissionStore((state) =>
    chatSessionId ? state.writeGrants.get(chatSessionId) ?? false : false
  );

  useEffect(() => {
    if (!chatSessionId || usePermissionStore.getState().writeGrants.has(chatSessionId)) return;

    let current = true;
    void getConversationWriteGrant(chatSessionId).then((granted) => {
      if (current && !usePermissionStore.getState().writeGrants.has(chatSessionId)) {
        usePermissionStore.getState().setWriteGrant(chatSessionId, granted);
      }
    });

    return () => {
      current = false;
    };
  }, [chatSessionId]);

  const revoke = useCallback(() => {
    if (!chatSessionId) return;
    void revokeConversationWriteGrant(chatSessionId);
  }, [chatSessionId]);

  return { writesEnabled, revoke };
}
