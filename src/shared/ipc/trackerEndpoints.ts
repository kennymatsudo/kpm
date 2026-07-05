/**
 * Tracker domain endpoint registry.
 *
 * Each entry is the single declaration of one `tracker:*` IPC endpoint: its
 * wire channel plus the Zod schema for its payload. `deriveDomainApi`
 * (preload) and the handler binding (`main/ipc/handlers/tracker.ts`) both
 * read this registry instead of hand-declaring the channel and schema twice.
 *
 * Method names are dotted to mirror the `window.api.tracker.*` call shape
 * (e.g. `'credentials.saveJira'` -> `window.api.tracker.credentials.saveJira`).
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type {
  ImportPreview,
  ImportResult,
  JiraCustomField,
  SyncPreview,
  SyncResult,
  TrackerAssociationWithScope,
  TrackerConnection,
  TrackerProjectScope,
} from '../types';

/**
 * Mirrors `CredentialInfoRow` from `main/services/core/TrackerService.ts` —
 * not re-imported from there to avoid a shared/ -> main/ dependency.
 */
type CredentialInfoRow =
  | { type: 'jira'; site_url: string; email: string; configured: true }
  | { type: 'linear'; configured: true };

interface IssueSummary {
  key: string;
  title: string;
  issueType: string;
  status: string;
}

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();
const optionalString = z.string().trim().optional();
const statusCategory = z.enum(['not_started', 'in_progress', 'in_review', 'done', 'blocked', 'canceled'], {
  message: 'Status category must be one of: not_started, in_progress, in_review, done, blocked, canceled',
});

/** Tracker type literal used across tracker schemas. */
export const trackerType = z.enum(['jira', 'linear'], {
  message: 'Tracker type must be "jira" or "linear"',
});

/** Jira site URL - hostname format like 'company.atlassian.net'. */
export const jiraSiteUrl = z
  .string()
  .min(1, 'Site URL is required')
  .transform((val) => {
    if (val.startsWith('https://')) return val.slice(8);
    if (val.startsWith('http://')) return val.slice(7);
    return val;
  })
  .refine(
    (hostname) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(hostname),
    'Site URL must be a valid hostname (e.g., company.atlassian.net)'
  );

/** Email validation. */
export const email = z.string().email('Invalid email format');

/** Non-empty API token. */
export const apiToken = nonEmptyString('API token');

/** Jira project key (uppercase letters and numbers). */
export const jiraProjectKey = z
  .string()
  .min(1, 'Project key is required')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Project key must be uppercase letters/numbers (e.g., "PROJ", "MY_PROJECT")');

/**
 * Scope/project key accepted across trackers. Jira uses uppercase letters/digits
 * (e.g. "PROJ", "MY_PROJECT"); Linear team keys are the same shape (e.g. "ENG").
 */
export const trackerProjectKey = jiraProjectKey;

const syncPreviewSchema = z.object({
  tracker_type: z.enum(['jira', 'linear']),
  link_id: z.string(),
  external_project_key: z.string(),
  new_items: z.array(
    z.object({
      external_key: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      label: z.string().nullable().optional(),
      external_issue_type: z.string(),
      external_status: z.string(),
      status_category: statusCategory,
      external_url: z.string(),
      external_parent_key: z.string().nullable(),
      external_epic_key: z.string().nullable(),
      external_assignee_id: z.string().nullable().optional(),
      external_assignee_name: z.string().nullable().optional(),
      external_assignee_avatar_url: z.string().nullable().optional(),
      external_creator_id: z.string().nullable().optional(),
      external_creator_name: z.string().nullable().optional(),
      external_creator_avatar_url: z.string().nullable().optional(),
    })
  ),
  updated_items: z.array(
    z.object({
      plan_item_id: z.string(),
      external_key: z.string(),
      title: z.string(),
      changes: z.array(
        z.object({
          field: z.enum([
            'title',
            'description',
            'label',
            'release_tag',
            'external_status',
            'status_category',
            'external_assignee_id',
            'external_assignee_name',
            'external_assignee_avatar_url',
            'external_creator_id',
            'external_creator_name',
            'external_creator_avatar_url',
          ]),
          old_value: z.string().nullable(),
          new_value: z.string().nullable(),
        })
      ),
    })
  ),
  conflicts: z.array(
    z.object({
      plan_item_id: z.string(),
      external_key: z.string(),
      title: z.string(),
      fields: z.array(
        z.object({
          field: z.enum(['title', 'description', 'label', 'release_tag']),
          your_value: z.string().nullable(),
          tracker_value: z.string().nullable(),
        })
      ),
    })
  ),
  deleted_in_tracker: z.array(
    z.object({
      id: z.string(),
      parent_id: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      label: z.string().nullable(),
      item_order: z.number(),
      code_refs: z.array(z.string()).nullable(),
      status: z.literal('planned'),
      release_tag: z.string().nullable(),
      position_x: z.number().nullable(),
      position_y: z.number().nullable(),
      association_id: z.string().nullable().optional(),
      external_key: z.string().nullable().optional(),
      external_id: z.string().nullable().optional(),
      external_type: z.enum(['jira', 'linear']).nullable().optional(),
      external_status: z.string().nullable().optional(),
      external_url: z.string().nullable().optional(),
      external_parent_key: z.string().nullable().optional(),
      external_epic_key: z.string().nullable().optional(),
      external_assignee_id: z.string().nullable().optional(),
      external_assignee_name: z.string().nullable().optional(),
      external_assignee_avatar_url: z.string().nullable().optional(),
      external_creator_id: z.string().nullable().optional(),
      external_creator_name: z.string().nullable().optional(),
      external_creator_avatar_url: z.string().nullable().optional(),
      sync_source: z.enum(['local', 'jira', 'linear']).optional(),
      last_synced_at: z.string().nullable().optional(),
    })
  ),
  stats: z.object({
    total: z.number(),
    new: z.number(),
    updated: z.number(),
    conflicts: z.number(),
    deleted: z.number(),
    unchanged: z.number(),
  }),
});

/**
 * One entry per `tracker:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.tracker`.
 *
 * Entries are plain object literals (not built via a generic factory
 * function) so each `params` schema keeps its precise literal type — routing
 * construction through a generic helper would widen `params` to the shared
 * `EndpointDefinition` bound and break per-endpoint payload inference.
 */
export const trackerEndpoints = {
  'credentials.get': { channel: 'tracker:credentials:get', params: null, result: resultOf<CredentialInfoRow[]>() },
  'credentials.saveJira': {
    channel: 'tracker:credentials:save:jira',
    params: z.object({ siteUrl: jiraSiteUrl, email, apiToken }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  'credentials.saveLinear': {
    channel: 'tracker:credentials:save:linear',
    params: z.object({ apiToken }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  'credentials.delete': { channel: 'tracker:credentials:delete', params: null, result: resultOf<{ success: true }>() },
  'credentials.deleteLinear': {
    channel: 'tracker:credentials:delete:linear',
    params: null,
    result: resultOf<{ success: true }>(),
  },
  'credentials.testJira': {
    channel: 'tracker:credentials:test:jira',
    params: z.object({ siteUrl: jiraSiteUrl, email, apiToken }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  'credentials.testLinear': {
    channel: 'tracker:credentials:test:linear',
    params: z.object({ apiToken }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },

  'connections.get': { channel: 'tracker:connections:get', params: null, result: resultOf<TrackerConnection[]>() },

  'scopes.get': {
    channel: 'tracker:scopes:get',
    params: z.object({ connectionId: uuid }),
    result: resultOf<TrackerProjectScope[]>(),
  },
  'scopes.add': {
    channel: 'tracker:scopes:add',
    params: z.object({ connectionId: uuid, projectKey: jiraProjectKey, projectName: optionalString }),
    result: resultOf<{ success: boolean; scope?: TrackerProjectScope; error?: string }>(),
  },

  'associations.get': {
    channel: 'tracker:associations:get',
    params: z.object({ projectId: uuid }),
    result: resultOf<TrackerAssociationWithScope[]>(),
  },
  'associations.add': {
    channel: 'tracker:associations:add',
    params: z.object({
      // Defaults to 'jira' for backward compatibility with callers that predate Linear support.
      trackerType: trackerType.default('jira'),
      projectId: uuid,
      // Linear passes a constant placeholder ("linear.app"); Jira passes the real hostname.
      siteUrl: z.string().min(1, 'Site URL is required'),
      projectKey: trackerProjectKey,
      projectName: optionalString,
      // Jira: JQL. Linear: JSON.stringify(LinearFilter).
      jqlFilter: nonEmptyString('Filter'),
      displayName: optionalString,
    }),
    result: resultOf<{ success: boolean; association?: TrackerAssociationWithScope; error?: string }>(),
  },
  'associations.remove': {
    channel: 'tracker:associations:remove',
    params: z.object({ associationId: uuid }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  'associations.hasImported': {
    channel: 'tracker:associations:has-imported',
    params: z.object({ associationId: uuid }),
    result: resultOf<boolean>(),
  },
  'associations.updateStatusMapping': {
    channel: 'tracker:associations:update-status-mapping',
    params: z.object({
      associationId: uuid,
      statusMapping: z
        .object({
          not_started: optionalString,
          in_progress: optionalString,
          in_review: optionalString,
          done: optionalString,
          blocked: optionalString,
          canceled: optionalString,
        })
        .nullable(),
    }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  'associations.updateCustomFieldValues': {
    channel: 'tracker:associations:update-custom-field-values',
    params: z.object({ associationId: uuid, customFieldValues: z.record(z.string(), z.string()).nullable() }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },
  'associations.updateEpicKey': {
    channel: 'tracker:associations:update-epic-key',
    params: z.object({ associationId: uuid, epicKey: z.string().nullable() }),
    result: resultOf<{ success: boolean; error?: string }>(),
  },

  'customFields.get': {
    channel: 'tracker:custom-fields:get',
    params: z.object({ projectKey: jiraProjectKey, issueTypeId: nonEmptyString('Issue type ID') }),
    result: resultOf<{ success: boolean; fields?: JiraCustomField[]; error?: string }>(),
  },

  'projects.listJira': {
    channel: 'tracker:projects:list:jira',
    params: null,
    result: resultOf<{ success: boolean; projects?: { key: string; name: string }[]; error?: string }>(),
  },
  'projects.listLinearTeams': {
    channel: 'tracker:projects:list:linear-teams',
    params: null,
    result: resultOf<{ success: boolean; teams?: { key: string; name: string }[]; error?: string }>(),
  },
  'projects.listLinearProjects': {
    channel: 'tracker:projects:list:linear-projects',
    params: z.object({ teamKey: trackerProjectKey }),
    result: resultOf<{ success: boolean; projects?: { id: string; name: string }[]; error?: string }>(),
  },

  'project.statuses': {
    channel: 'tracker:project:statuses',
    params: z.object({ projectKey: trackerProjectKey, trackerType: trackerType.default('jira') }),
    result: resultOf<{ success: boolean; statuses?: { id: string; name: string; categoryKey: string }[]; error?: string }>(),
  },
  'project.labels': {
    channel: 'tracker:project:labels',
    params: z.object({ projectKey: jiraProjectKey }),
    result: resultOf<{ success: boolean; labels?: string[]; error?: string }>(),
  },
  'project.components': {
    channel: 'tracker:project:components',
    params: z.object({ projectKey: jiraProjectKey }),
    result: resultOf<{ success: boolean; components?: { id: string; name: string }[]; error?: string }>(),
  },

  'issues.search': {
    channel: 'tracker:issues:search',
    params: z.object({ projectKey: jiraProjectKey, searchText: z.string().max(500, 'Search text too long') }),
    result: resultOf<{ success: boolean; issues?: IssueSummary[]; error?: string }>(),
  },
  'issues.searchJql': {
    channel: 'tracker:issues:search-jql',
    params: z.object({ projectKey: jiraProjectKey, jql: z.string().max(1000, 'JQL query too long') }),
    result: resultOf<{ success: boolean; issues?: IssueSummary[]; error?: string }>(),
  },
  'issues.recent': {
    channel: 'tracker:issues:recent',
    params: z.object({ projectKey: jiraProjectKey }),
    result: resultOf<{ success: boolean; issues?: IssueSummary[]; error?: string }>(),
  },

  'import.preview': {
    channel: 'tracker:import:preview',
    params: z.object({ projectId: uuid, associationId: uuid }),
    result: resultOf<{ success: boolean; preview?: ImportPreview; error?: string }>(),
  },
  'import.apply': {
    channel: 'tracker:import:apply',
    params: z.object({
      projectId: uuid,
      associationId: uuid,
      selectedTypes: z.array(z.string()).min(1, 'At least one issue type must be selected'),
    }),
    result: resultOf<{ success: boolean; result?: ImportResult; error?: string }>(),
  },
  'import.all': {
    channel: 'tracker:import:all',
    params: z.object({ projectId: uuid, associationId: uuid }),
    result: resultOf<{ success: boolean; result?: ImportResult; error?: string }>(),
  },

  'sync.preview': {
    channel: 'tracker:sync:preview',
    params: z.object({ projectId: uuid, associationId: uuid }),
    result: resultOf<{ success: boolean; preview?: SyncPreview; error?: string }>(),
  },
  'sync.apply': {
    channel: 'tracker:sync:apply',
    params: z.object({
      projectId: uuid,
      preview: syncPreviewSchema,
      resolutions: z.record(z.string(), z.enum(['keep_mine', 'use_theirs'])),
      deletedAction: z.enum(['keep_local', 'delete', 'decide_each']),
      deletedDecisions: z.record(z.string(), z.enum(['keep', 'delete'])).optional(),
    }),
    result: resultOf<{ success: boolean; result?: SyncResult; error?: string }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type TrackerEndpoints = typeof trackerEndpoints;
export type TrackerEndpointName = keyof TrackerEndpoints;
