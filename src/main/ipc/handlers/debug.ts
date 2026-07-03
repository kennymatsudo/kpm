import { debugEndpoints, type DebugEndpointName } from '../../../shared/ipc/debugEndpoints';
import { bindRegistryHandlers } from '../validation/utils';

// Debug mode flag - set via IPC from renderer
let debugEnabled = false;

/**
 * Register debug IPC handlers.
 *
 * Response shape is a bare `{ enabled }` (no `success` envelope), unlike
 * every other domain's registry handlers, so this binds `debugEndpoints`
 * via `bindRegistryHandlers` instead of `createRegistryIpcHandlers`.
 *
 * Currently only exposes the debug-mode toggle. Future diagnostic handlers
 * should gate themselves on `debugEnabled` before returning any sensitive
 * state.
 */
export function registerDebugHandlers(): void {
  const handlers: Record<DebugEndpointName, (params: unknown) => unknown> = {
    setEnabled: (enabled) => {
      debugEnabled = enabled as boolean;
      console.log(`[Debug] Debug mode ${debugEnabled ? 'enabled' : 'disabled'}`);
      return { enabled: debugEnabled };
    },

    isEnabled: () => {
      return { enabled: debugEnabled };
    },
  };

  bindRegistryHandlers(debugEndpoints, handlers);
}
