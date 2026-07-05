/**
 * Export domain endpoint registry.
 *
 * One entry per `export:*` IPC endpoint. These back the `window.api.tracker.exportQueue`,
 * `window.api.tracker.export`, `window.api.tracker.typeMappings`, and
 * `window.api.tracker.issueTypes` nested surfaces — export was deliberately
 * excluded from the tracker registry's `tracker:*` scope because its channel
 * prefix is `export:*`, not `tracker:*`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type {
  ExportPreview,
  ExportResult,
  SyncQueueEntryWithPlanItem,
  SyncReviewData,
  TrackerTypeMapping,
} from '../types';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();
const statusCategory = z.enum(['not_started', 'in_progress', 'in_review', 'done', 'blocked', 'canceled'], {
  message: 'Status category must be one of: not_started, in_progress, in_review, done, blocked, canceled',
});
const jiraProjectKey = z
  .string()
  .min(1, 'Project key is required')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Project key must be uppercase letters/numbers (e.g., "PROJ", "MY_PROJECT")');

interface JiraIssueTypeSummary {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
  iconUrl?: string;
}

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/export.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export const exportEndpoints = {
  'queue.get': {
    channel: 'export:queue:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ entries: SyncQueueEntryWithPlanItem[] }>>(),
  },
  'queue.add': {
    channel: 'export:queue:add',
    params: z.object({
      projectId: uuid,
      itemIds: z.array(uuid).min(1, 'At least one item ID is required'),
      associationId: uuid.optional(),
    }),
    result: resultOf<RegistryResponse<{ queued: string[]; skipped: { id: string; reason: string }[] }>>(),
  },
  'queue.remove': {
    channel: 'export:queue:remove',
    params: z.object({ queueEntryId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  'queue.clear': {
    channel: 'export:queue:clear',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  'queue.updateStatus': {
    channel: 'export:queue:update-status',
    params: z.object({ queueEntryId: uuid, statusCategory: statusCategory.nullable() }),
    result: resultOf<RegistryResponse<{ removed: boolean }>>(),
  },
  'queue.updateCustomFields': {
    channel: 'export:queue:update-custom-fields',
    params: z.object({ queueEntryId: uuid, customFieldOverrides: z.record(z.string(), z.string()).nullable() }),
    result: resultOf<RegistryResponse>(),
  },
  'queue.count': {
    channel: 'export:queue:count',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ count: number }>>(),
  },

  preview: {
    channel: 'export:preview',
    params: z.object({ projectId: uuid, associationId: uuid }),
    result: resultOf<RegistryResponse<{ preview: ExportPreview }>>(),
  },
  review: {
    channel: 'export:review',
    params: z.object({ projectId: uuid, associationId: uuid }),
    result: resultOf<RegistryResponse<{ reviewData: SyncReviewData }>>(),
  },
  executeApproved: {
    channel: 'export:execute-approved',
    params: z.object({ projectId: uuid, associationId: uuid, approvedItemIds: z.array(uuid) }),
    result: resultOf<RegistryResponse<{ result: ExportResult }>>(),
  },

  'mappings.get': {
    channel: 'export:mappings:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<RegistryResponse<{ mappings: TrackerTypeMapping[] }>>(),
  },
  'mappings.getByScope': {
    channel: 'export:mappings:get-by-scope',
    params: z.object({ projectId: uuid, scopeId: uuid }),
    result: resultOf<RegistryResponse<{ mappings: TrackerTypeMapping[] }>>(),
  },
  'mappings.save': {
    channel: 'export:mappings:save',
    params: z.object({
      projectId: uuid,
      scopeId: uuid,
      kpmLabel: nonEmptyString('Label'),
      trackerIssueTypeId: nonEmptyString('Issue type ID'),
      trackerIssueTypeName: nonEmptyString('Issue type name'),
    }),
    result: resultOf<RegistryResponse<{ mapping: TrackerTypeMapping }>>(),
  },
  'mappings.remove': {
    channel: 'export:mappings:remove',
    params: z.object({ mappingId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
  'mappings.createDefaults': {
    channel: 'export:mappings:create-defaults',
    params: z.object({ projectId: uuid, scopeId: uuid }),
    result: resultOf<RegistryResponse<{ mappings: TrackerTypeMapping[] }>>(),
  },

  'issueTypes.get': {
    channel: 'export:issue-types:get',
    params: z.object({ projectKey: jiraProjectKey }),
    result: resultOf<RegistryResponse<{ issueTypes: JiraIssueTypeSummary[] }>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type ExportEndpoints = typeof exportEndpoints;
export type ExportEndpointName = keyof ExportEndpoints;
