/**
 * Prompt Override IPC Handlers
 *
 * CRUD operations for prompt overrides.
 */

import { promptOverridesEndpoints, type PromptOverridesEndpointName } from '../../../shared/ipc/promptOverridesEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import type { PromptOverrideService } from '../../services/core/PromptOverrideService';
import { unwrapOrThrow } from '../../services/result';
import { createRegistryIpcHandlers } from '../validation/utils';

type PromptOverridesHandler<K extends PromptOverridesEndpointName> = (
  params: EndpointPayload<(typeof promptOverridesEndpoints)[K]>,
  event: Electron.IpcMainInvokeEvent
) => Promise<unknown>;

/**
 * One handler per `promptOverridesEndpoints` entry. A registry entry without
 * a matching key here is a compile error, not a runtime "no handler" failure.
 */
type PromptOverridesHandlers = { [K in PromptOverridesEndpointName]: PromptOverridesHandler<K> };

function buildPromptOverridesHandlers(promptOverrideService: PromptOverrideService): PromptOverridesHandlers {
  return {
    /** List all prompts with override status, optionally filtered by category. */
    list: async ({ category }) => {
      const prompts = category ? promptOverrideService.listByCategory(category) : promptOverrideService.listAll();
      return { prompts };
    },

    /** Get a prompt's full definition with current content. */
    get: async ({ key }) => {
      const definition = promptOverrideService.getDefinition(key);
      if (!definition) {
        throw new Error(`Unknown prompt key: ${key}`);
      }
      return { prompt: definition };
    },

    /** Set a prompt override. */
    set: async ({ key, content }) => {
      unwrapOrThrow(promptOverrideService.setOverride(key, content));
    },

    /** Reset a prompt to its default content. */
    reset: async ({ key }) => {
      promptOverrideService.resetToDefault(key);
    },
  };
}

export function registerPromptOverrideHandlers(promptOverrideService: PromptOverrideService): void {
  createRegistryIpcHandlers(promptOverridesEndpoints, buildPromptOverridesHandlers(promptOverrideService), 'Prompt override operation failed');
}
