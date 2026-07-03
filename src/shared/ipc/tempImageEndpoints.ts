/**
 * Temp image domain endpoint registry.
 *
 * One entry per `temp-image:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.tempImages`.
 *
 * `delete` takes a `filePath` scoped to KPM's OS-temp images directory. That
 * scoping check depends on `os.tmpdir()` (main-process-only, not derivable
 * in shared/renderer code), so this registry only validates the path is
 * absolute; `handlers/tempImages.ts` layers the temp-dir scoping refine on
 * top before use, same as it did pre-migration via `TempImageSchemas`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { absolutePath } from './sharedSchemas';

const supportedImageFormat = z.enum(
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'],
  { message: 'Unsupported image format. Supported: PNG, JPEG, GIF, WebP, BMP' }
);

export const tempImageEndpoints = {
  save: {
    channel: 'temp-image:save',
    params: z.object({
      imageData: z.instanceof(Uint8Array, { message: 'Image data must be a Uint8Array' }),
      format: supportedImageFormat,
    }),
  },
  delete: {
    channel: 'temp-image:delete',
    params: z.object({ filePath: absolutePath }),
  },
} satisfies Record<string, EndpointDefinition>;

export type TempImageEndpoints = typeof tempImageEndpoints;
export type TempImageEndpointName = keyof TempImageEndpoints;
