/**
 * Zustand store for permission prompts.
 *
 * Manages pending permission requests from the main process. The inline
 * `PermissionPrompt` in chat renders the request for the *viewed* session;
 * `PendingRequestsBadge` surfaces everything else, including requests in
 * another project entirely.
 *
 * Deliberately NOT project-scoped and NOT reset on a project switch: a request
 * is a turn blocked on the user, and dropping it on switch would leave the
 * turn stalled until it times out with nothing on screen to explain why. The
 * same applies to `writeGrants`, which is keyed by project precisely so it can
 * describe more than the open one.
 */

import { create } from 'zustand';
import type { PermissionRequest, PermissionAction } from '../../shared/types';
import { respondToPermissionRequest } from '../services/permissionService';

interface PermissionStore {
  pendingRequests: Map<string, PermissionRequest[]>;
  unscopedPendingRequests: PermissionRequest[];
  writeGrants: Map<string, boolean>;

  enqueueRequest: (request: PermissionRequest) => void;
  setWriteGrant: (projectId: string, granted: boolean) => void;
  /** Drop a request main resolved without us (timeout, aborted turn). */
  settleRequest: (requestId: string) => void;

  respond: (request: PermissionRequest, action: PermissionAction) => void;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
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
  setWriteGrant: (projectId, granted) => {
    set((state) => {
      const writeGrants = new Map(state.writeGrants);
      writeGrants.set(projectId, granted);
      return { writeGrants };
    });
  },

  settleRequest: (requestId) => {
    set((state) => {
      const pendingRequests = new Map<string, PermissionRequest[]>();
      let changed = false;

      for (const [chatSessionId, queue] of state.pendingRequests) {
        const remaining = queue.filter((pending) => pending.requestId !== requestId);
        if (remaining.length !== queue.length) changed = true;
        if (remaining.length > 0) pendingRequests.set(chatSessionId, remaining);
      }

      const unscopedPendingRequests = state.unscopedPendingRequests.filter(
        (pending) => pending.requestId !== requestId
      );
      if (unscopedPendingRequests.length !== state.unscopedPendingRequests.length) changed = true;

      if (!changed) return state;
      return { pendingRequests, unscopedPendingRequests };
    });
  },

  respond: (request, action) => {
    respondToPermissionRequest(request.requestId, request.projectId, action)
      .then(() => {
        get().settleRequest(request.requestId);
      })
      .catch((error: unknown) => {
        console.error('[PermissionStore] Failed to send response:', error);
        get().settleRequest(request.requestId);
      });
  },
}));

/**
 * Requests the user cannot currently see: everything except the queue for the
 * chat session on screen, whose prompt renders inline in the message list.
 *
 * Without this, a request raised in a background tab — or a whole other
 * project — is invisible until it times out an hour later, and the turn it
 * blocks just looks stuck.
 */
export function selectUnseenRequests(
  state: Pick<PermissionStore, 'pendingRequests' | 'unscopedPendingRequests'>,
  viewedSessionId: string | null,
): PermissionRequest[] {
  const unseen: PermissionRequest[] = [];

  for (const [chatSessionId, queue] of state.pendingRequests) {
    if (chatSessionId === viewedSessionId) continue;
    unseen.push(...queue);
  }

  // The unscoped prompt renders only when no session is viewed at all.
  if (viewedSessionId !== null) {
    unseen.push(...state.unscopedPendingRequests);
  }

  return unseen;
}
