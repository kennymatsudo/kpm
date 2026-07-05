import { shell } from 'electron';
import { createRegistryIpcHandlers } from '../validation/utils';
import { shellEndpoints, type ShellEndpointName } from '../../../shared/ipc/shellEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';

/**
 * One handler per `shellEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ShellHandlers = { [K in ShellEndpointName]: UnwrappedHandlerFor<typeof shellEndpoints, K> };

const handlers: ShellHandlers = {
  openExternal: async ({ url }) => {
    await shell.openExternal(url);
  },
};

export function registerShellHandlers(): void {
  createRegistryIpcHandlers(shellEndpoints, handlers, 'Failed to open URL');
}
