/**
 * Action domain endpoint registry.
 *
 * One entry per `action:*` IPC endpoint, keyed by the dotted method path used on
 * `window.api.actions`. The field schemas come from `shared/actions.ts` so the
 * wire and the domain cannot drift; `update` validates the partial's fields here
 * and the merged result in `ActionService`, since the cross-field rules only hold
 * over a whole action.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import { actionEditableSchema, actionFieldsSchema } from '../actions';
import type { ActionDefinition, ActionRun } from '../actions';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/actions.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const actionEndpoints = {
  list: {
    channel: 'action:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ actions: ActionDefinition[] }>>(),
  },
  get: {
    channel: 'action:get',
    params: z.object({ id: uuid }),
    result: resultOf<RegistryResponse<{ action: ActionDefinition }>>(),
  },
  create: {
    channel: 'action:create',
    params: actionEditableSchema,
    result: resultOf<RegistryResponse<{ action: ActionDefinition }>>(),
  },
  update: {
    channel: 'action:update',
    params: z.object({ id: uuid, updates: actionFieldsSchema.partial() }),
    result: resultOf<RegistryResponse<{ action: ActionDefinition }>>(),
  },
  setEnabled: {
    channel: 'action:set-enabled',
    params: z.object({ id: uuid, enabled: z.boolean() }),
    result: resultOf<RegistryResponse<{ action: ActionDefinition }>>(),
  },
  delete: {
    channel: 'action:delete',
    params: z.object({ id: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  runNow: {
    channel: 'action:run-now',
    params: z.object({ id: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  history: {
    channel: 'action:history',
    params: z.object({ actionId: uuid, limit: z.number().int().min(1).max(200).optional() }),
    result: resultOf<RegistryResponse<{ runs: ActionRun[] }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ActionEndpoints = typeof actionEndpoints;
export type ActionEndpointName = keyof ActionEndpoints;
