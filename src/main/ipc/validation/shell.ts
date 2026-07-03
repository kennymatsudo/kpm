/**
 * Shell Validation Schemas
 *
 * Payload schema is owned by `shared/ipc/shellEndpoints.ts` (one entry per
 * IPC endpoint, shared with the preload bridge and the handler binding).
 */

import { shellEndpoints } from '../../../shared/ipc/shellEndpoints';

export const ShellSchemas = {
  /** Open URL in default browser */
  openExternal: shellEndpoints.openExternal.params,
};
