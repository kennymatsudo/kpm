/**
 * Standardized IPC Response Types
 *
 * All IPC handlers should return IpcResponse<T> for consistency.
 * This module provides the type definitions and conversion helpers.
 *
 * ## Response Contract
 *
 * All IPC responses follow this shape:
 * - Success: `{ success: true, data: T }`
 * - Error: `{ success: false, error: string }`
 *
 * ## Usage in Handlers
 *
 * ```ts
 * // Converting ServiceResult to IpcResponse
 * ipcMain.handle('plan:update-item', (_event, params) => {
 *   const { itemId, updates } = planEndpoints.updateItem.params.parse(params);
 *   return toIpcResponse(planService.updateItem(itemId, updates));
 * });
 *
 * // Direct success/error
 * ipcMain.handle('project:list', () => {
 *   const projects = projectService.list();
 *   return ipcSuccess(projects);
 * });
 * ```
 */

import type { ServiceResult } from '../services/result';

// =============================================================================
// Response Types
// =============================================================================

/**
 * Standard IPC success response.
 * Always includes data field for type safety.
 */
export interface IpcSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Standard IPC error response.
 */
export interface IpcErrorResponse {
  success: false;
  error: string;
}

/**
 * Unified IPC response type.
 *
 * Usage on renderer:
 * ```ts
 * const result = await window.api.invoke('plan:list-items', { projectId });
 * if (result.success) {
 *   console.log(result.data); // Type-safe access
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export type IpcResponse<T> = IpcSuccessResponse<T> | IpcErrorResponse;

// =============================================================================
// Response Constructors
// =============================================================================

/**
 * Create a success response with data.
 */
export function ipcSuccess<T>(data: T): IpcSuccessResponse<T> {
  return { success: true, data };
}

/**
 * Create an error response.
 */
export function ipcError(error: string): IpcErrorResponse {
  return { success: false, error };
}

// =============================================================================
// ServiceResult Converters
// =============================================================================

/**
 * Convert a ServiceResult to an IpcResponse.
 * Use this for synchronous service methods.
 *
 * @example
 * ```ts
 * ipcMain.handle('plan:delete-item', (_event, params) => {
 *   const { itemId } = PlanSchemas.deleteItem.parse(params);
 *   return toIpcResponse(planService.deleteItem(itemId));
 * });
 * ```
 */
export function toIpcResponse<T>(result: ServiceResult<T>): IpcResponse<T> {
  return result.ok
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}
