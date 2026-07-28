/**
 * Zustand store for permission prompts.
 *
 * Manages pending permission requests from the main process.
 * Displays inline PermissionPrompt in chat interface.
 */

import { create } from 'zustand';
import type { PermissionRequest, PermissionAction } from '../../shared/types';
import { respondToPermissionRequest } from '../services/permissionService';

interface PermissionStore {
  pendingRequests: Map<string, PermissionRequest[]>;
  unscopedPendingRequests: PermissionRequest[];
  writeGrants: Map<string, boolean>;

  enqueueRequest: (request: PermissionRequest) => void;
  setWriteGrant: (chatSessionId: string, granted: boolean) => void;

  respond: (request: PermissionRequest, action: PermissionAction) => void;
}

export const usePermissionStore = create<PermissionStore>((set) => ({
  pendingRequests: new Map(),
  unscopedPendingRequests: [],
  writeGrants: new Map(),

  enqueueRequest: (request) => {
    const chatSessionId = request.chatSessionId;
    if (!chatSessionId) {
      set((state) => ({
        unscopedPendingRequests: [...state.unscopedPendingRequests, request],
      }));
      return;
    }

    set((state) => {
      const pendingRequests = new Map(state.pendingRequests);
      const queue = pendingRequests.get(chatSessionId) ?? [];
      pendingRequests.set(chatSessionId, [...queue, request]);
      return { pendingRequests };
    });
  },
  setWriteGrant: (chatSessionId, granted) => {
    set((state) => {
      const writeGrants = new Map(state.writeGrants);
      writeGrants.set(chatSessionId, granted);
      return { writeGrants };
    });
  },

  respond: (request, action) => {
    const removeRequest = (): void => {
      set((state) => {
        if (!request.chatSessionId) {
          return {
            unscopedPendingRequests: state.unscopedPendingRequests.filter(
              (pending) => pending.requestId !== request.requestId
            ),
          };
        }

        const pendingRequests = new Map(state.pendingRequests);
        const remaining = (pendingRequests.get(request.chatSessionId) ?? []).filter(
          (pending) => pending.requestId !== request.requestId
        );
        if (remaining.length === 0) {
          pendingRequests.delete(request.chatSessionId);
        } else {
          pendingRequests.set(request.chatSessionId, remaining);
        }
        return { pendingRequests };
      });
    };

    respondToPermissionRequest(request.requestId, request.projectId, action)
      .then(() => {
        removeRequest();
      })
      .catch((error: unknown) => {
        console.error('[PermissionStore] Failed to send response:', error);
        removeRequest();
      });
  },
}));
