/**
 * Chat and Streaming Session Validation Schemas
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
// Focused Resource Schema
// =============================================================================

/** Schema for FocusedResource type */
const focusedResourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan_item'), id: z.string(), title: z.string() }),
  z.object({ type: z.literal('project_file'), path: z.string(), isDirectory: z.boolean() }),
  z.object({ type: z.literal('repo'), id: z.string(), path: z.string().optional() }),
  z.object({ type: z.literal('document'), id: z.string(), title: z.string(), path: z.string() }),
]);

// =============================================================================
// Chat View Mode Schema
// =============================================================================

/** Current UI view mode - used for prompt customization, not session separation */
export const chatViewModeSchema = z.enum(['plan', 'workspace', 'focus']).optional();

const focusChatDocumentSchema = z.object({
  path: z.string().min(1).max(1000),
  title: z.string().min(1).max(300),
  content: z.string().max(300000),
});

// =============================================================================
// Chat Schemas
// =============================================================================

export const ChatSchemas = {
  send: z.object({
      projectId: uuid,
      message: z.string().min(1, 'Message cannot be empty').max(100000, 'Message too long'),
      focusedResources: z.array(focusedResourceSchema).default([]),
      model: claudeModel.optional(),
      effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
      tempImages: z.array(tempImagePath).optional(),
      chatSessionId: uuid.optional(),
      clientMessageId: uuid.optional(),
      /** Current UI view - used for prompt customization */
      currentView: chatViewModeSchema,
      /** Focus-reader document context for slim focused chat sessions */
      focusDocument: focusChatDocumentSchema.optional(),
    }),

  cancel: z.object({
    projectId: uuid,
    chatSessionId: uuid, // Required for multi-session support
  }),

  cancelQueued: z.object({
    projectId: uuid,
    chatSessionId: uuid,
    clientMessageId: uuid.optional(),
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

  getSessionHistory: z.object({
    projectId: uuid,
    limit: z.number().int().min(1).max(20).optional().default(5),
  }),

  loadSession: z.object({
    projectId: uuid,
    chatSessionId: uuid,
  }),

  getFocusDocumentSession: z.object({
    projectId: uuid,
    path: z.string().min(1).max(1000),
    title: z.string().max(300).default(''),
    contentHash: z.string().min(1).max(128),
  }),

  getActiveSessions: z.object({
    projectId: uuid,
  }),

  disconnectSpecificSession: z.object({
    projectId: uuid,
    chatSessionId: uuid,
  }),

  getSessionState: z.object({
    projectId: uuid,
    chatSessionId: uuid,
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
    chatSessionId: uuid,
  }),

};
