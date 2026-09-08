import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionAction, PermissionRequest } from '../../../shared/types';
import { extractPath, getToolPreview } from '../../claude/permissions';
import { getConfig } from '../../config';
import { failure, success, type ServiceResult } from '../result';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { permissionEvents } from '../../../shared/ipc/permissionEvents';

interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  timeoutId: NodeJS.Timeout;
  projectId: string;
  input: Record<string, unknown>;
}

const pendingPermissions = new Map<string, PendingPermission>();

interface PromptOptions {
  signal?: AbortSignal;
  chatSessionId?: string;
  kind?: PermissionRequest['kind'];
  title?: string;
}

/**
 * Scope lives on the request, not the answer: a 'write-access' yes becomes the
 * project's standing grant (recorded by whoever asked, through
 * `ProjectWriteGrants.request`), an 'elicitation' yes covers that call only.
 */

export async function promptUser(
  mainWindow: BrowserWindow | null,
  projectId: string,
  toolName: string,
  input: Record<string, unknown>,
  options: PromptOptions,
): Promise<PermissionResult> {
  if (!mainWindow) {
    return {
      behavior: 'deny',
      message: 'Permission denied: No window available',
    };
  }

  return emitPrompt(mainWindow, projectId, toolName, input, options);
}

function emitPrompt(
  mainWindow: BrowserWindow,
  projectId: string,
  toolName: string,
  input: Record<string, unknown>,
  options: PromptOptions,
): Promise<PermissionResult> {
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const targetPath = extractPath(toolName, input);
    const preview = getToolPreview(toolName, input);
    const kind = options.kind ?? 'write-access';
    const permissionTimeoutMs = getConfig().session.permissionRequestTimeoutMs;

    // Tell the renderer whenever a request stops needing an answer without the
    // user giving one, so its pending queue doesn't advertise a dead request.
    const notifySettled = (reason: 'timeout' | 'cancelled') => {
      if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
      emitAppEvent(mainWindow.webContents, permissionEvents.settled, { requestId, reason });
    };

    const timeoutId = setTimeout(() => {
      pendingPermissions.delete(requestId);
      notifySettled('timeout');
      resolve({
        behavior: 'deny',
        message: 'Permission request timed out',
        interrupt: true,
      });
    }, permissionTimeoutMs);

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        pendingPermissions.delete(requestId);
        notifySettled('cancelled');
        resolve({
          behavior: 'deny',
          message: 'Permission request cancelled',
          interrupt: true,
        });
      });
    }

    pendingPermissions.set(requestId, { resolve, timeoutId, projectId, input });

    emitAppEvent(mainWindow.webContents, permissionEvents.request, {
      requestId,
      projectId,
      chatSessionId: options.chatSessionId ?? null,
      toolName,
      targetPath,
      preview,
      kind,
      title: options.title,
    });
  });
}

export function resolvePromptResponse(
  response: { requestId: string; projectId: string; action: PermissionAction },
): ServiceResult<void> {
  const { requestId, projectId, action } = response;
  const pending = pendingPermissions.get(requestId);

  if (!pending) {
    console.warn(`[Permissions] No pending request for ID: ${requestId}`);
    return failure('Permission request not found');
  }

  if (projectId !== pending.projectId) {
    return failure('Permission request project does not match');
  }

  clearTimeout(pending.timeoutId);
  pendingPermissions.delete(requestId);

  if (action === 'deny') {
    pending.resolve({
      behavior: 'deny',
      message: 'User denied permission',
      interrupt: true,
    });
    return success(undefined);
  }

  // `updatedInput` replaces the tool's arguments, so it has to echo the
  // original rather than an empty object — returning {} strips the call.
  pending.resolve({ behavior: 'allow', updatedInput: pending.input });
  return success(undefined);
}
