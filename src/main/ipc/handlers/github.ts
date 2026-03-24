/**
 * GitHub IPC Handlers
 *
 * Bridges renderer to GitHubService for PR management operations.
 */

import { ipcMain } from 'electron';
import { GitHubSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import { createIpcHandler } from '../validation/utils';
import type { createGitHubService } from '../../services/repo/GitHubService';
import { unwrapOrThrow } from '../../services/result';

type GitHubService = ReturnType<typeof createGitHubService>;

export function registerGitHubHandlers(gitHubService: GitHubService): void {
  ipcMain.handle(
    IPC_CHANNELS.github.checkAuth,
    createIpcHandler(
      GitHubSchemas.checkAuth,
      async ({ sessionId }) => {
        const result = await gitHubService.checkAuth(sessionId);
        return unwrapOrThrow(result);
      },
      'Failed to check GitHub auth'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.github.createPr,
    createIpcHandler(
      GitHubSchemas.createPr,
      async ({ sessionId, title, body, draft }) => {
        return unwrapOrThrow(await gitHubService.createPr(sessionId, title, body, draft));
      },
      'Failed to create pull request'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.github.getPrStatus,
    createIpcHandler(
      GitHubSchemas.getPrStatus,
      async ({ sessionId }) => {
        const status = unwrapOrThrow(await gitHubService.getPrStatus(sessionId));
        return { status };
      },
      'Failed to get PR status'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.github.getPrComments,
    createIpcHandler(
      GitHubSchemas.getPrComments,
      async ({ sessionId }) => {
        const comments = unwrapOrThrow(await gitHubService.getPrComments(sessionId));
        return { comments };
      },
      'Failed to get PR comments'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.github.buildPrContext,
    createIpcHandler(
      GitHubSchemas.buildPrContext,
      async ({ sessionId }) => {
        return unwrapOrThrow(await gitHubService.buildPrContext(sessionId));
      },
      'Failed to build PR context'
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.github.buildAddressCommentsContext,
    createIpcHandler(
      GitHubSchemas.buildAddressCommentsContext,
      async ({ sessionId }) => {
        const context = unwrapOrThrow(await gitHubService.buildAddressCommentsContext(sessionId));
        return { context };
      },
      'Failed to build address comments context'
    )
  );
}
