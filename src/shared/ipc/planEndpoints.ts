/**
 * Plan domain endpoint registry.
 *
 * One entry per `plan:*` IPC endpoint, keyed by the dotted method path used on
 * `window.api.plan`. `plan:refresh-requested` is a main->renderer event, not
 * an invoke endpoint, so it stays a hand-written literal in
 * `src/main/services/appServices.ts` / `src/preload/api.ts` (it predates
 * `IPC_CHANNELS`, matching its pre-migration state).
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { planActionSchema } from '../planActionSchema';
import { buildPlanItemUpdateShape } from '../planItemFieldSchemas';
import { uuid } from './sharedSchemas';
import type { PlanActionResult, PlanRelation } from '../types';
import type { PlanItem } from '../base-types';

const relationType = z.enum(['depends_on', 'blocks', 'relates_to'], {
  message: 'Relation type must be "depends_on", "blocks", or "relates_to"',
});
const canvasPosition = z.number().int().min(-10000).max(100000);

const planItemUpdates = z
  .object(buildPlanItemUpdateShape('ipc'))
  .refine((u) => Object.keys(u).length > 0, 'At least one update field is required');

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/plan.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const planEndpoints = {
  listItems: {
    channel: 'plan:list-items',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ items: PlanItem[] }>>(),
  },
  executeActions: {
    channel: 'plan:execute-actions',
    params: z.object({
      projectId: uuid,
      actions: z.array(planActionSchema).min(1, 'At least one action is required'),
    }),
    result: resultOf<RegistryResponse<{ result: PlanActionResult }>>(),
  },
  addRelation: {
    channel: 'plan:add-relation',
    params: z.object({
      project_id: uuid,
      from_item_id: uuid,
      to_item_id: uuid,
      relation_type: relationType,
    }),
    result: resultOf<RegistryResponse<{ relation: PlanRelation }>>(),
  },
  removeRelation: {
    channel: 'plan:remove-relation',
    params: z.object({ relationId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  getRelations: {
    channel: 'plan:get-relations',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ relations: PlanRelation[] }>>(),
  },
  updatePosition: {
    channel: 'plan:update-position',
    params: z.object({ itemId: uuid, x: canvasPosition, y: canvasPosition }),
    result: resultOf<RegistryResponse>(),
  },
  updatePositions: {
    channel: 'plan:update-positions',
    params: z.object({
      updates: z.array(z.object({ id: uuid, x: canvasPosition, y: canvasPosition })).max(500),
    }),
    result: resultOf<RegistryResponse>(),
  },
  updateItem: {
    channel: 'plan:update-item',
    params: z.object({ itemId: uuid, updates: planItemUpdates }),
    result: resultOf<RegistryResponse>(),
  },
  deleteItem: {
    channel: 'plan:delete-item',
    params: z.object({ itemId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  deleteItemWithDescendants: {
    channel: 'plan:delete-item-with-descendants',
    params: z.object({ itemId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  getChildCount: {
    channel: 'plan:get-child-count',
    params: z.object({ itemId: uuid }),
    result: resultOf<RegistryResponse<{ count: number }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type PlanEndpoints = typeof planEndpoints;
export type PlanEndpointName = keyof PlanEndpoints;
