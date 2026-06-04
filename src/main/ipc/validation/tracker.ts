/**
 * Tracker and Export Validation Schemas
 */

import { z } from 'zod';
import {
  uuid,
  nonEmptyString,
  optionalString,
  statusCategory,
  jiraSiteUrl,
  email,
  apiToken,
  jiraProjectKey,
} from './shared';

/** Tracker type literal used across tracker schemas. */
export const trackerType = z.enum(['jira', 'linear'], {
  message: 'Tracker type must be "jira" or "linear"',
});

/**
 * Scope/project key accepted across trackers. Jira uses uppercase letters/digits
 * (e.g. "PROJ", "MY_PROJECT"); Linear team keys are the same shape (e.g. "ENG").
 */
export const trackerProjectKey = jiraProjectKey;

// =============================================================================
// Tracker Schemas
// =============================================================================

export const TrackerSchemas = {
  // Credentials
  saveJiraCredentials: z.object({
    siteUrl: jiraSiteUrl,
    email: email,
    apiToken: apiToken,
  }),

  testJiraConnection: z.object({
    siteUrl: jiraSiteUrl,
    email: email,
    apiToken: apiToken,
  }),

  // Linear credentials — API key only; no site URL / email.
  saveLinearCredentials: z.object({
    apiToken: apiToken,
  }),

  testLinearConnection: z.object({
    apiToken: apiToken,
  }),

  // Scopes
  getScopes: z.object({
    connectionId: uuid,
  }),

  addScope: z.object({
    connectionId: uuid,
    projectKey: jiraProjectKey,
    projectName: optionalString,
  }),

  // Associations
  getAssociations: z.object({
    projectId: uuid,
  }),

  addAssociation: z.object({
    // `trackerType` defaults to 'jira' for backward compatibility with callers
    // that predate Linear support.
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

  removeAssociation: z.object({
    associationId: uuid,
  }),

  hasImported: z.object({
    associationId: uuid,
  }),

  // Issue operations
  searchIssues: z.object({
    projectKey: jiraProjectKey,
    searchText: z.string().max(500, 'Search text too long'),
  }),

  searchIssuesByJql: z.object({
    projectKey: jiraProjectKey,
    jql: z.string().max(1000, 'JQL query too long'),
  }),

  recentIssues: z.object({
    projectKey: jiraProjectKey,
  }),

  projectLabels: z.object({
    projectKey: jiraProjectKey,
  }),

  projectComponents: z.object({
    projectKey: jiraProjectKey,
  }),

  // Import
  importPreview: z.object({
    projectId: uuid,
    associationId: uuid,
  }),

  importApply: z.object({
    projectId: uuid,
    associationId: uuid,
    selectedTypes: z.array(z.string()).min(1, 'At least one issue type must be selected'),
  }),

  // Sync
  syncPreview: z.object({
    projectId: uuid,
    associationId: uuid,
  }),

  syncApply: z.object({
    projectId: uuid,
    preview: z.object({
      tracker_type: z.enum(['jira', 'linear']),
      link_id: z.string(),
      external_project_key: z.string(),
      new_items: z.array(
        z.object({
          external_key: z.string(),
          title: z.string(),
          description: z.string().nullable(),
          label: z.string().nullable(),
          external_issue_type: z.string(),
          external_status: z.string(),
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
          // External tracker fields - all optional/nullable
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
    }),
    resolutions: z.record(z.string(), z.enum(['keep_mine', 'use_theirs'])),
    deletedAction: z.enum(['keep_local', 'delete', 'decide_each']),
    deletedDecisions: z.record(z.string(), z.enum(['keep', 'delete'])).optional(),
  }),

  // Status Mapping (shared across trackers; trackerType defaults to Jira for legacy callers)
  getProjectStatuses: z.object({
    projectKey: trackerProjectKey,
    trackerType: trackerType.default('jira'),
  }),

  // List Linear projects within a team
  listLinearProjects: z.object({
    teamKey: trackerProjectKey,
  }),

  updateStatusMapping: z.object({
    associationId: uuid,
    statusMapping: z.object({
      not_started: optionalString,
      in_progress: optionalString,
      in_review: optionalString,
      done: optionalString,
      blocked: optionalString,
      canceled: optionalString,
    }).nullable(),
  }),

  // Custom Fields
  getCustomFields: z.object({
    projectKey: jiraProjectKey,
    issueTypeId: nonEmptyString('Issue type ID'),
  }),

  updateCustomFieldValues: z.object({
    associationId: uuid,
    customFieldValues: z.record(z.string(), z.string()).nullable(),
  }),

  updateEpicKey: z.object({
    associationId: uuid,
    epicKey: z.string().nullable(),
  }),
};

// =============================================================================
// Export Schemas
// =============================================================================

export const ExportSchemas = {
  // Queue operations
  getQueue: z.object({
    projectId: uuid,
  }),

  addToQueue: z.object({
    projectId: uuid,
    itemIds: z.array(uuid).min(1, 'At least one item ID is required'),
    associationId: uuid.optional(),
  }),

  removeFromQueue: z.object({
    queueEntryId: uuid,
  }),

  clearQueue: z.object({
    projectId: uuid,
  }),

  updateQueueStatus: z.object({
    queueEntryId: uuid,
    statusCategory: statusCategory.nullable(),
  }),

  updateQueueCustomFields: z.object({
    queueEntryId: uuid,
    customFieldOverrides: z.record(z.string(), z.string()).nullable(),
  }),

  // Preview and execute
  preview: z.object({
    projectId: uuid,
    associationId: uuid,
  }),

  // Sync review (task-by-task approval)
  executeApproved: z.object({
    projectId: uuid,
    associationId: uuid,
    approvedItemIds: z.array(uuid),
  }),

  // Type mappings
  getMappings: z.object({
    projectId: uuid,
  }),

  getMappingsByScope: z.object({
    projectId: uuid,
    scopeId: uuid,
  }),

  saveMapping: z.object({
    projectId: uuid,
    scopeId: uuid,
    kpmLabel: nonEmptyString('Label'),
    trackerIssueTypeId: nonEmptyString('Issue type ID'),
    trackerIssueTypeName: nonEmptyString('Issue type name'),
  }),

  removeMapping: z.object({
    mappingId: uuid,
  }),

  createDefaultMappings: z.object({
    projectId: uuid,
    scopeId: uuid,
  }),

  // Issue types
  getIssueTypes: z.object({
    projectKey: jiraProjectKey,
  }),
};
