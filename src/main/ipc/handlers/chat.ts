import { ipcMain } from 'electron';
import type { ChatService } from '../../services/core/ChatService';
import type { SlashCommandService } from '../../services/core/SlashCommandService';
import { ChatSchemas, StreamingSessionSchemas, createIpcHandler } from '../validation';
import { createSimpleIpcHandler } from '../validation/utils';
import { IPC_CHANNELS } from '../channels';

export function registerChatHandlers(
  chatService: ChatService,
  slashCommandService: SlashCommandService,
): void {
  ipcMain.handle(
    IPC_CHANNELS.chat.getSlashCommands,
    createSimpleIpcHandler(
      () => {
        const result = slashCommandService.listCommands();
        if (!result.ok) throw new Error(result.error);
        return { commands: result.data };
      },
      'Failed to list slash commands',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.send,
    createIpcHandler(
      ChatSchemas.send,
      async (params) => {
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to send chat message',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.cancel,
    createIpcHandler(
      ChatSchemas.cancel,
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to cancel chat message',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.cancelQueued,
    createIpcHandler(
      ChatSchemas.cancelQueued,
      ({ projectId, chatSessionId, clientMessageId }) => {
        const result = chatService.cancelQueued(projectId, chatSessionId, clientMessageId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to cancel queued message',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.newSession,
    createIpcHandler(
      ChatSchemas.newSession,
      ({ projectId }) => {
        const result = chatService.newSession(projectId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to start new chat session',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.connectSession,
    createIpcHandler(
      StreamingSessionSchemas.connectSession,
      ({ projectId }) => {
        const result = chatService.connectSession(projectId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to connect chat session',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.disconnectSession,
    createIpcHandler(
      ChatSchemas.disconnectSession,
      async ({ projectId }) => {
        const result = await chatService.disconnectSession(projectId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to disconnect chat session',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.getActiveSessions,
    createIpcHandler(
      ChatSchemas.getActiveSessions,
      ({ projectId }) => {
        const result = chatService.getActiveSessions(projectId);
        if (!result.ok) throw new Error(result.error);
        return { sessions: result.data };
      },
      'Failed to get active chat sessions',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.disconnectSpecificSession,
    createIpcHandler(
      ChatSchemas.disconnectSpecificSession,
      async ({ projectId, chatSessionId }) => {
        const result = await chatService.disconnectSpecificSession(projectId, chatSessionId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to disconnect specific chat session',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.getSessionState,
    createIpcHandler(
      ChatSchemas.getSessionState,
      ({ projectId, chatSessionId }) => {
        const result = chatService.getSessionState(projectId, chatSessionId);
        if (!result.ok) throw new Error(result.error);
        return { state: result.data };
      },
      'Failed to get chat session state',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.getUsage,
    createIpcHandler(
      ChatSchemas.getUsage,
      ({ projectId }) => {
        const result = chatService.getUsage(projectId);
        if (!result.ok) throw new Error(result.error);
        return { usage: result.data };
      },
      'Failed to get chat usage',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.getMessages,
    createIpcHandler(
      ChatSchemas.getMessages,
      ({ projectId }) => {
        const result = chatService.getMessages(projectId);
        if (!result.ok) throw new Error(result.error);
        return { messages: result.data };
      },
      'Failed to get chat messages',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.getSessionHistory,
    createIpcHandler(
      ChatSchemas.getSessionHistory,
      ({ projectId, limit }) => {
        const result = chatService.getSessionHistory(projectId, limit);
        if (!result.ok) throw new Error(result.error);
        return { sessions: result.data };
      },
      'Failed to get chat session history',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.chat.loadSession,
    createIpcHandler(
      ChatSchemas.loadSession,
      ({ projectId, chatSessionId }) => {
        const result = chatService.loadSession(projectId, chatSessionId);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      'Failed to load chat session',
    ),
  );
}
