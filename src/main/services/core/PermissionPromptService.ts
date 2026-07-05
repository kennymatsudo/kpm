import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionAction } from '../../../shared/types';
import { extractPath, getToolPreview } from '../../claude/permissions';
import { getConfig } from '../../config';
import type { PermissionService } from './PermissionService';
import { failure, success, type ServiceResult } from '../result';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { permissionEvents } from '../../../shared/ipc/permissionEvents';

interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  timeoutId: NodeJS.Timeout;
  projectId: string;
  toolName: string;
  targetPath: string | null;
  preview: string;
}

const pendingPermissions = new Map<string, PendingPermission>();

export async function promptUser(
  mainWindow: BrowserWindow | null,
  projectId: string,
  toolName: string,
  input: Record<string, unknown>,
  options: { signal?: AbortSignal; title?: string; displayName?: string; description?: string },
): Promise<PermissionResult> {
  if (!mainWindow) {
    return {
      behavior: 'deny',
      message: 'Permission denied: No window available',
    };
  }

  return new Promise((resolve) => {
    const requestId = randomUUID();
    const targetPath = extractPath(toolName, input);
    const preview = getToolPreview(toolName, input);
    const permissionTimeoutMs = getConfig().session.permissionRequestTimeoutMs;

    const timeoutId = setTimeout(() => {
      pendingPermissions.delete(requestId);
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
        resolve({
          behavior: 'deny',
          message: 'Permission request cancelled',
          interrupt: true,
        });
      });
    }

    pendingPermissions.set(requestId, {
      resolve,
      timeoutId,
      projectId,
      toolName,
      targetPath,
      preview,
    });

    emitAppEvent(mainWindow.webContents, permissionEvents.request, {
      requestId,
      projectId,
      toolName,
      targetPath,
      preview,
      ...(options.title && { title: options.title }),
      ...(options.displayName && { displayName: options.displayName }),
      ...(options.description && { description: options.description }),
    });
  });
}

export function resolvePromptResponse(
  permissionService: PermissionService,
  response: { requestId: string; projectId: string; action: PermissionAction },
): ServiceResult<void> {
  const { requestId, projectId, action } = response;
  const pending = pendingPermissions.get(requestId);

  if (!pending) {
    console.warn(`[Permissions] No pending request for ID: ${requestId}`);
    return failure('Permission request not found');
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

  if (action === 'allow-all-remaining') {
    const allowAllResult = permissionService.allowAllRemaining(projectId);
    if (!allowAllResult.ok) {
      return allowAllResult;
    }

    pending.resolve({
      behavior: 'allow',
      updatedInput: {},
    });
    return success(undefined);
  }

  const result: PermissionResult & { allowAlways?: boolean } = {
    behavior: 'allow',
    updatedInput: {},
  };

  if (action === 'allow-always') {
    result.allowAlways = true;
    const persistResult = permissionService.persistAlwaysAllowed(
      projectId,
      pending.toolName,
      pending.targetPath,
      pending.preview,
    );
    if (!persistResult.ok) {
      return persistResult;
    }
  }

  pending.resolve(result);
  return success(undefined);
}
