/**
 * Chat and Streaming Session Validation Schemas
 */

import { z } from 'zod';
import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';
import { chatEndpoints, chatViewModeSchema } from '../../../shared/ipc/chatEndpoints';
import { absolutePath } from './shared';

export { chatViewModeSchema };

// =============================================================================
// Temp Image Path Validation (used by chat)
// =============================================================================

/** Validates path is within KPM temp images directory (prevents path traversal) */
export const tempImagePath = absolutePath.refine(
  (p) => {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(p);
    return normalizedPath.startsWith(tempDir + path.sep);
  },
  'Path must be within KPM temp images directory'
);

// =============================================================================
// Chat Schemas
// =============================================================================
//
// Payload schemas are owned by `shared/ipc/chatEndpoints.ts`. `send`'s
// registry schema validates `tempImages` entries are absolute paths but
// can't also scope them to KPM's OS-temp images directory (main-process-only
// — see `chatEndpoints.ts`), so that scoping refine is layered back on here.

export const ChatSchemas = {
  send: chatEndpoints.send.params.extend({ tempImages: z.array(tempImagePath).optional() }),
  cancel: chatEndpoints.cancel.params,
  cancelQueued: chatEndpoints.cancelQueued.params,
  newSession: chatEndpoints.newSession.params,
  disconnectSession: chatEndpoints.disconnectSession.params,
  getUsage: chatEndpoints.getUsage.params,
  getMessages: chatEndpoints.getMessages.params,
  getSessionHistory: chatEndpoints.getSessionHistory.params,
  loadSession: chatEndpoints.loadSession.params,
  getFocusDocumentSession: chatEndpoints.getFocusDocumentSession.params,
  getActiveSessions: chatEndpoints.getActiveSessions.params,
  disconnectSpecificSession: chatEndpoints.disconnectSpecificSession.params,
  getSessionState: chatEndpoints.getSessionState.params,
};

// =============================================================================
// Streaming Session Schemas
// =============================================================================

export const StreamingSessionSchemas = {
  /** Connect main chat session */
  connectSession: chatEndpoints.connectSession.params,

  /** Disconnect main chat session */
  disconnectSession: chatEndpoints.disconnectSession.params,

  /** Get main chat session state */
  getSessionState: chatEndpoints.getSessionState.params,
};
