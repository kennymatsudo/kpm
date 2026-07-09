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
import { resultOf, type EndpointDefinition } from './endpoints';
import { absolutePath, uuid } from './sharedSchemas';
import { CHAT_PROVIDERS } from '../types';
import type { ChatMessage, ChatSessionScope, ChatSessionSummary, PiProviderOption, SessionState, SlashCommandInfo } from '../types';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/chat.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

/** Mirrors `ActiveSessionInfo` from `main/services/streaming/StreamingSessionService.ts`. */
interface ActiveSessionInfo {
  chatSessionId: string;
  scope: ChatSessionScope;
  state: SessionState;
  isProcessing: boolean;
  title?: string | null;
}

/** Mirrors `FocusDocumentSessionResult` from `main/services/core/ChatService.ts`. */
interface FocusDocumentSessionResult {
  chatSessionId: string;
  messages: ChatMessage[];
}

const claudeModel = z.enum(['opus', 'sonnet'], { message: 'Model must be "opus" or "sonnet"' });
const chatProvider = z.enum(CHAT_PROVIDERS, { message: 'Provider must be "claude", "codex", or "pi"' });

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
      /** pi-only `"<provider>/<modelId>"` selection; ignored unless `provider` is `'pi'`. */
      providerModel: z.string().optional(),
      effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
      tempImages: z.array(absolutePath).optional(),
      chatSessionId: uuid.optional(),
      clientMessageId: uuid.optional(),
      currentView: chatViewModeSchema,
      focusDocument: focusChatDocumentSchema.optional(),
    }),
    result: resultOf<RegistryResponse>(),
  },
  cancel: {
    channel: 'chat:cancel',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  cancelQueued: {
    channel: 'chat:cancel-queued',
    params: z.object({ projectId: uuid, chatSessionId: uuid, clientMessageId: uuid.optional() }),
    result: resultOf<RegistryResponse>(),
  },
  newSession: {
    channel: 'chat:new-session',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  connectSession: {
    channel: 'chat:connect-session',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  disconnectSession: {
    channel: 'chat:disconnect-session',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  getActiveSessions: {
    channel: 'chat:get-active-sessions',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ sessions: ActiveSessionInfo[] }>>(),
  },
  disconnectSpecificSession: {
    channel: 'chat:disconnect-specific-session',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  getSessionState: {
    channel: 'chat:get-session-state',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
    result: resultOf<RegistryResponse<{ state: SessionState }>>(),
  },
  getUsage: {
    channel: 'chat:get-usage',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ usage: { totalTokens: number; inputTokens: number; outputTokens: number } }>>(),
  },
  getMessages: {
    channel: 'chat:get-messages',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ messages: ChatMessage[] }>>(),
  },
  getSessionHistory: {
    channel: 'chat:get-session-history',
    params: z.object({ projectId: uuid, limit: z.number().int().min(1).max(20).optional().default(5) }),
    result: resultOf<RegistryResponse<{ sessions: ChatSessionSummary[] }>>(),
  },
  loadSession: {
    channel: 'chat:load-session',
    params: z.object({ projectId: uuid, chatSessionId: uuid }),
    result: resultOf<RegistryResponse<{ messages: ChatMessage[]; chatSessionId: string }>>(),
  },
  getFocusDocumentSession: {
    channel: 'chat:get-focus-document-session',
    params: z.object({
      projectId: uuid,
      path: z.string().min(1).max(1000),
      title: z.string().max(300).default(''),
      contentHash: z.string().min(1).max(128),
    }),
    result: resultOf<RegistryResponse<FocusDocumentSessionResult>>(),
  },
  getSlashCommands: {
    channel: 'chat:get-slash-commands',
    params: null,
    result: resultOf<RegistryResponse<{ commands: SlashCommandInfo[] }>>(),
  },
  piProviders: {
    channel: 'chat:pi-providers',
    params: null,
    result: resultOf<RegistryResponse<{ available: boolean; providers: PiProviderOption[] }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ChatEndpoints = typeof chatEndpoints;
export type ChatEndpointName = keyof ChatEndpoints;
