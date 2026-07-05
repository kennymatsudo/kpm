/**
 * Temp Image IPC Handlers
 *
 * Handles saving and deleting ephemeral images pasted into chat inputs.
 * Images are stored in OS temp directory, not in project folders.
 */

import { ipcMain } from 'electron';
import * as TempImageService from '../../services/files/TempImageService';
import { tempImageEndpoints, type TempImageEndpointName } from '../../../shared/ipc/tempImageEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import { TempImageDeleteSchema } from '../validation/artifacts';

/**
 * One handler per `tempImageEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type TempImageHandlers = { [K in TempImageEndpointName]: HandlerFor<typeof tempImageEndpoints, K> };

function buildTempImageHandlers(): TempImageHandlers {
  return {
    /**
     * Save a pasted image to the temp directory.
     * Returns the absolute path and filename on success.
     */
    save: async ({ imageData, format }) => {
      // Convert Uint8Array to Buffer
      const buffer = Buffer.from(imageData);
      return TempImageService.savePastedImage(buffer, format);
    },

    /**
     * Delete a specific temp image.
     * Used when user clicks X on an image badge before sending.
     */
    delete: async ({ filePath }) => {
      try {
        await TempImageService.deleteImage(filePath);
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    },
  };
}

export function registerTempImageHandlers(): void {
  const handlers = buildTempImageHandlers();

  // `TempImageDeleteSchema` layers the temp-dir scoping refine that the
  // shared registry's `params` can't express (see `validation/artifacts.ts`),
  // so `delete` parses through it instead of `tempImageEndpoints.delete.params`.
  const validationOverrides: Partial<Record<TempImageEndpointName, typeof TempImageDeleteSchema>> = {
    delete: TempImageDeleteSchema,
  };

  for (const [name, { channel, params }] of Object.entries(tempImageEndpoints) as [
    TempImageEndpointName,
    (typeof tempImageEndpoints)[TempImageEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildTempImageHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown, event: Electron.IpcMainInvokeEvent) => unknown;
    const schema = validationOverrides[name] ?? params;
    ipcMain.handle(channel, async (event, rawParams: unknown) => {
      const parsedParams = schema ? schema.parse(rawParams) : undefined;
      return handler(parsedParams, event);
    });
  }
}
