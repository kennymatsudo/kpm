/**
 * IPC Handlers for Actions
 *
 * Mutations delegate to ActionService, which owns name uniqueness, merged-state
 * validation, and scheduler coordination. Plain reads go straight to the
 * repositories — there is no behaviour to wrap.
 */

import { actionEndpoints, type ActionEndpointName } from '../../../shared/ipc/actionEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { IActionRepository, IActionRunRepository } from '../../db/interfaces';
import type { ActionService } from '../../services/core/ActionService';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `actionEndpoints` entry. A registry entry without a matching
 * key here is a compile error, not a runtime "no handler" failure.
 */
type ActionHandlers = {
  [K in ActionEndpointName]: UnwrappedHandlerFor<typeof actionEndpoints, K>;
};

export function buildActionHandlers(
  actionService: ActionService,
  actions: IActionRepository,
  actionRuns: IActionRunRepository
): ActionHandlers {
  return {
    list: async ({ projectId }) => ({ actions: actions.listForProject(projectId) }),

    get: async ({ id }) => {
      const action = actions.get(id);
      if (!action) throw new Error(`Action not found: ${id}`);
      return { action };
    },

    create: async (input) => {
      const result = actionService.create(input);
      if (!result.ok) throw new Error(result.error);
      return { action: result.data };
    },

    update: async ({ id, updates }) => {
      const result = actionService.update(id, updates);
      if (!result.ok) throw new Error(result.error);
      return { action: result.data };
    },

    setEnabled: async ({ id, enabled }) => {
      const result = actionService.setEnabled(id, enabled);
      if (!result.ok) throw new Error(result.error);
      return { action: result.data };
    },

    delete: async ({ id }) => {
      const result = actionService.delete(id);
      if (!result.ok) throw new Error(result.error);
    },

    runNow: async ({ id }) => {
      const result = await actionService.runNow(id);
      if (!result.ok) throw new Error(result.error);
    },

    history: async ({ actionId, limit }) => ({ runs: actionRuns.listByAction(actionId, limit) }),
  };
}

export function registerActionHandlers(
  actionService: ActionService,
  actions: IActionRepository,
  actionRuns: IActionRunRepository
): void {
  const handlers = buildActionHandlers(actionService, actions, actionRuns);
  createRegistryIpcHandlers(actionEndpoints, handlers, 'Action operation failed');
}
