/**
 * Zustand store for permission prompts.
 *
 * Manages pending permission requests from the main process.
 * Displays inline PermissionPrompt in chat interface.
 */

import { create } from 'zustand';
import type { PermissionRequest, PermissionAction } from '../../shared/types';

interface PermissionStore {
  /** Current pending permission request (only one at a time) */
  pendingRequest: PermissionRequest | null;

  /** Set pending request (from IPC) */
  setPendingRequest: (request: PermissionRequest | null) => void;

  /** Respond to pending request */
  respond: (action: PermissionAction) => void;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  pendingRequest: null,

  setPendingRequest: (request) => {
    set({ pendingRequest: request });
  },

  respond: (action) => {
    const { pendingRequest } = get();
    if (!pendingRequest) {
      console.warn('[PermissionStore] No pending request to respond to');
      return;
    }

    // Send response to main process
      .then(() => {
        // Clear pending request
        set({ pendingRequest: null });
      })
      .catch((error: unknown) => {
        console.error('[PermissionStore] Failed to send response:', error);
        // Clear pending request anyway
        set({ pendingRequest: null });
      });
  },
}));
