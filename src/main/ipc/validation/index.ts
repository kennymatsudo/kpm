/**
 * IPC Validation Schemas
 *
 * The endpoint registries under `src/shared/ipc/*Endpoints.ts` are the single
 * owner of every domain's payload schema — read `{domain}Endpoints['x.y'].params`
 * directly rather than importing an alias from here. This module only holds
 * what the registry can't express on its own: shared reusable schema pieces,
 * the IPC handler wiring utilities, and the stronger refines layered on top
 * of specific registry entries (path-existence / temp-dir scoping checks that
 * need Node builtins unavailable in registry files bundled into the renderer).
 */

export {
  ValidationError,
  createIpcHandler,
  createSimpleIpcHandler,
  createRegistryIpcHandlers,
  bindRegistryHandlers,
  type IpcSuccessResponse,
  type IpcErrorResponse,
  type IpcResponse,
} from './utils';

export {
  // Basic types
  uuid,
  nonEmptyString,
  optionalString,
  // Project & Plan types
  projectName,
  projectPhase,
  planItemStatus,
  planItemLabel,
  relationType,
  canvasPosition,
  // Path types
  absolutePath,
  existingDirectoryPath,
  existingFilePath,
  relativePath,
  // Tracker types
  jiraProjectKey,
  // Claude types
  claudeModel,
  devSessionStatus,
  type DevSessionStatusZod,
  // Misc types
  anthropicApiKey,
  supportedImageFormat,
} from './shared';

// =============================================================================
// Refines layered on registry schemas (validationOverrides pattern)
// =============================================================================

export { RepoSchemas, AttachmentAddSchema } from './project';
export { ChatSendSchema } from './chat';
export { TempImageDeleteSchema, ChatAttachmentReadAsDataUrlSchema, ChatAttachmentOpenTempSchema } from './artifacts';
