/**
 * IPC Validation Utilities
 *
 * Provides validation wrappers, error classes, and response types for IPC handlers.
 */

import type { z, ZodError } from 'zod';
import { assertTrustedIpcSender } from '../senderValidation';

/**
 * Custom error class for validation failures.
 * Formats Zod errors into user-friendly messages.
 */
export class ValidationError extends Error {
  constructor(zodError: ZodError) {
    // Zod v4 uses 'issues' instead of 'errors'
    const messages = zodError.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    super(`Validation failed: ${messages.join('; ')}`);
    this.name = 'ValidationError';
  }
}

// =============================================================================
// Standard IPC Response Types
// =============================================================================

/** Standard success response */
export type IpcSuccessResponse<T = void> = T extends void
  ? { success: true }
  : { success: true } & T;

/** Standard error response */
export interface IpcErrorResponse {
  success: false;
  error: string;
}

/** Standard IPC response union */
export type IpcResponse<T = void> = IpcSuccessResponse<T> | IpcErrorResponse;

// =============================================================================
// IPC Handler Wrapper
// =============================================================================

/**
 * Creates a type-safe, validated IPC handler with consistent error handling.
 *
 * This wrapper provides:
 * - Zod schema validation of inputs
 * - Consistent error message formatting
 * - Standard response shape ({ success: true/false, error?, ...data })
 * - Access to the IPC event for handlers that need it (e.g., for webContents.id)
 *
 * @example
 * ```ts
 * // Simple handler without event access
 * ipcMain.handle('project:get', createIpcHandler(
 *   ProjectSchemas.get,
 *   async ({ id }) => {
 *     const project = ProjectRepository.get(id);
 *     if (!project) throw new Error('Project not found');
 *     return { project };
 *   },
 *   'Failed to get project'
 * ));
 *
 * // Handler with event access
 * ipcMain.handle('session:start', createIpcHandler(
 *   SessionSchemas.start,
 *   async ({ sessionId }, event) => {
 *     const webContentsId = event.sender.id;
 *     // ...
 *   },
 *   'Failed to start session'
 * ));
 * ```
 */
export function createIpcHandler<TInput, TOutput extends object | void>(
  schema: z.ZodSchema<TInput>,
  handler: (params: TInput, event: Electron.IpcMainInvokeEvent) => TOutput | Promise<TOutput>,
  fallbackError = 'Operation failed'
): (event: Electron.IpcMainInvokeEvent, params: unknown) => Promise<IpcResponse<TOutput>> {
  return async (event, params) => {
    try {
      assertTrustedIpcSender(event);

      // Validate input
      const parseResult = schema.safeParse(params);
      if (!parseResult.success) {
        const error = new ValidationError(parseResult.error);
        return { success: false, error: error.message };
      }

      // Execute handler with validated params and event
      const result = await handler(parseResult.data, event);

      // Return success response
      if (result === undefined || result === null) {
        return { success: true } as IpcResponse<TOutput>;
      }
      return { success: true, ...result } as IpcResponse<TOutput>;
    } catch (e) {
      // Log full error for debugging
      console.error(`[IPC] ${fallbackError}:`, e);

      // Return user-friendly error message
      const errorMessage = e instanceof Error ? e.message : fallbackError;
      return { success: false, error: errorMessage };
    }
  };
}

/**
 * Creates a simple IPC handler without validation (for parameter-less handlers).
 *
 * @example
 * ```ts
 * ipcMain.handle('project:list', createSimpleIpcHandler(
 *   async () => {
 *     const projects = ProjectRepository.list();
 *     return { projects };
 *   },
 *   'Failed to list projects'
 * ));
 * ```
 */
export function createSimpleIpcHandler<TOutput extends object | void>(
  handler: () => TOutput | Promise<TOutput>,
  fallbackError = 'Operation failed'
): (event: Electron.IpcMainInvokeEvent) => Promise<IpcResponse<TOutput>> {
  return async (event) => {
    try {
      assertTrustedIpcSender(event);

      const result = await handler();

      if (result === undefined || result === null) {
        return { success: true } as IpcResponse<TOutput>;
      }
      return { success: true, ...result } as IpcResponse<TOutput>;
    } catch (e) {
      console.error(`[IPC] ${fallbackError}:`, e);
      const errorMessage = e instanceof Error ? e.message : fallbackError;
      return { success: false, error: errorMessage };
    }
  };
}
