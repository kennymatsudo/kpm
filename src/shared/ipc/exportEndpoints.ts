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
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();
const statusCategory = z.enum(['not_started', 'in_progress', 'in_review', 'done', 'blocked', 'canceled'], {
  message: 'Status category must be one of: not_started, in_progress, in_review, done, blocked, canceled',
});
const jiraProjectKey = z
  .string()
  .min(1, 'Project key is required')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Project key must be uppercase letters/numbers (e.g., "PROJ", "MY_PROJECT")');

export const exportEndpoints = {
  'queue.get': { channel: 'export:queue:get', params: z.object({ projectId: uuid }) },
  'queue.add': {
    channel: 'export:queue:add',
    params: z.object({
      projectId: uuid,
      itemIds: z.array(uuid).min(1, 'At least one item ID is required'),
      associationId: uuid.optional(),
    }),
  },
  'queue.remove': { channel: 'export:queue:remove', params: z.object({ queueEntryId: uuid }) },
  'queue.clear': { channel: 'export:queue:clear', params: z.object({ projectId: uuid }) },
  'queue.updateStatus': {
    channel: 'export:queue:update-status',
    params: z.object({ queueEntryId: uuid, statusCategory: statusCategory.nullable() }),
  },
  'queue.updateCustomFields': {
    channel: 'export:queue:update-custom-fields',
    params: z.object({ queueEntryId: uuid, customFieldOverrides: z.record(z.string(), z.string()).nullable() }),
  },
  'queue.count': { channel: 'export:queue:count', params: z.object({ projectId: uuid }) },

  preview: { channel: 'export:preview', params: z.object({ projectId: uuid, associationId: uuid }) },
  review: { channel: 'export:review', params: z.object({ projectId: uuid, associationId: uuid }) },
  executeApproved: {
    channel: 'export:execute-approved',
    params: z.object({ projectId: uuid, associationId: uuid, approvedItemIds: z.array(uuid) }),
  },

  'mappings.get': { channel: 'export:mappings:get', params: z.object({ projectId: uuid }) },
  'mappings.getByScope': {
    channel: 'export:mappings:get-by-scope',
    params: z.object({ projectId: uuid, scopeId: uuid }),
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
  },
  'mappings.remove': { channel: 'export:mappings:remove', params: z.object({ mappingId: uuid }) },
  'mappings.createDefaults': {
    channel: 'export:mappings:create-defaults',
    params: z.object({ projectId: uuid, scopeId: uuid }),
  },

  'issueTypes.get': { channel: 'export:issue-types:get', params: z.object({ projectKey: jiraProjectKey }) },
} satisfies Record<string, EndpointDefinition>;

export type ExportEndpoints = typeof exportEndpoints;
export type ExportEndpointName = keyof ExportEndpoints;
