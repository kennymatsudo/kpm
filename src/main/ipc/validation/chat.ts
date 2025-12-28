/**
 */

import { z } from 'zod';
import * as path from 'path';
import { getTempImagesDir } from '../../services/files/TempImageService';
import {
  uuid,
  absolutePath,
  claudeModel,
} from './shared';

// =============================================================================
// =============================================================================

export const tempImagePath = absolutePath.refine(
  (p) => {
    const tempDir = getTempImagesDir();
    const normalizedPath = path.normalize(p);
    return normalizedPath.startsWith(tempDir + path.sep);
  },
);

// =============================================================================
// Focused Resource Schema
// =============================================================================

/** Schema for FocusedResource type */
const focusedResourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan_item'), id: z.string(), title: z.string() }),
]);

// =============================================================================
// Chat Schemas
// =============================================================================

export const ChatSchemas = {

  cancel: z.object({
    projectId: uuid,
  }),

  newSession: z.object({
    projectId: uuid,
  }),

  disconnectSession: z.object({
    projectId: uuid,
  }),

  getUsage: z.object({
    projectId: uuid,
  }),

  getMessages: z.object({
    projectId: uuid,
  }),
};

// =============================================================================
// Streaming Session Schemas
// =============================================================================

export const StreamingSessionSchemas = {
  /** Connect main chat session */
  connectSession: z.object({
    projectId: uuid,
  }),

  /** Disconnect main chat session */
  disconnectSession: z.object({
    projectId: uuid,
  }),

  /** Get main chat session state */
  getSessionState: z.object({
    projectId: uuid,
  }),

};
