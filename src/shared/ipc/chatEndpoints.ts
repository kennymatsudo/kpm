/**
 * Chat domain endpoint registry.
 *
 * Covers only the invoke surface (`IPC_CHANNELS.chat`, 15 channels). Chat's
 * ~20 streaming/progress channels (`chat:chunk`, `chat:done`, etc.) are
 * `webContents.send`/`ipcRenderer.on` events emitted from
 * `StreamingSessionService`/`ChatRuntimeService`, not invoke endpoints, so
 * they stay hand-declared in `src/preload/api.ts` and out of this registry.
 *
 * `send.tempImages` is scoped to KPM's OS-temp images directory
 * (`os.tmpdir()`-derived, main-process-only, not derivable in shared/renderer
 * code) — this registry only validates each path is absolute;
 * `validation/chat.ts` layers the temp-dir scoping refine back on, the same
 * escape hatch used by `tempImageEndpoints.ts`/`attachmentEndpoints.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';

const claudeModel = z.enum(['opus', 'sonnet'], { message: 'Model must be "opus" or "sonnet"' });
const chatProvider = z.enum(['claude', 'codex'], { message: 'Provider must be "claude" or "codex"' });

const focusedResourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan_item'), id: z.string(), title: z.string() }),
  z.object({ type: z.literal('project_file'), path: z.string(), isDirectory: z.boolean() }),
  z.object({ type: z.literal('repo'), id: z.string(), path: z.string().optional() }),
  z.object({ type: z.literal('document'), id: z.string(), title: z.string(), path: z.string() }),
]);

/** Current UI view mode - used for prompt customization, not session separation */
export const chatViewModeSchema = z.enum(['plan', 'workspace', 'focus']).optional();

const focusChatDocumentSchema = z.object({
  path: z.string().min(1).max(1000),
  title: z.string().min(1).max(300),
  content: z.string().max(300000),
});

export const chatEndpoints = {
  send: {
    channel: 'chat:send',
    params: z.object({
      projectId: uuid,
      message: z.string().min(1, 'Message cannot be empty').max(100000, 'Message too long'),
      focusedResources: z.array(focusedResourceSchema).default([]),
      provider: chatProvider.optional(),
      model: claudeModel.optional(),
      effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
      tempImages: z.array(absolutePath).optional(),
      chatSessionId: uuid.optional(),
      clientMessageId: uuid.optional(),
      currentView: chatViewModeSchema,
      focusDocument: focusChatDocumentSchema.optional(),
    }),
  },
  cancel: {
    channel: 'chat:cancel',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
  },
  cancelQueued: {
    channel: 'chat:cancel-queued',
    params: z.object({ projectId: uuid, chatSessionId: uuid, clientMessageId: uuid.optional() }),
  },
  newSession: {
    channel: 'chat:new-session',
    params: z.object({ projectId: uuid }),
  },
  connectSession: {
    channel: 'chat:connect-session',
    params: z.object({ projectId: uuid }),
  },
  disconnectSession: {
    channel: 'chat:disconnect-session',
    params: z.object({ projectId: uuid }),
  },
  getActiveSessions: {
    channel: 'chat:get-active-sessions',
    params: z.object({ projectId: uuid }),
  },
  disconnectSpecificSession: {
    channel: 'chat:disconnect-specific-session',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
  },
  getSessionState: {
    channel: 'chat:get-session-state',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
  },
  getUsage: {
    channel: 'chat:get-usage',
    params: z.object({ projectId: uuid }),
  },
  getMessages: {
    channel: 'chat:get-messages',
    params: z.object({ projectId: uuid }),
  },
  getSessionHistory: {
    channel: 'chat:get-session-history',
    params: z.object({ projectId: uuid, limit: z.number().int().min(1).max(20).optional().default(5) }),
  },
  loadSession: {
    channel: 'chat:load-session',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
  },
  getFocusDocumentSession: {
    channel: 'chat:get-focus-document-session',
    params: z.object({
      projectId: uuid,
      path: z.string().min(1).max(1000),
      title: z.string().max(300).default(''),
      contentHash: z.string().min(1).max(128),
    }),
  },
  getSlashCommands: {
    channel: 'chat:get-slash-commands',
    params: null,
  },
} satisfies Record<string, EndpointDefinition>;

export type ChatEndpoints = typeof chatEndpoints;
export type ChatEndpointName = keyof ChatEndpoints;
