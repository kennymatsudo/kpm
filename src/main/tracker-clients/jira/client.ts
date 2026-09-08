import { createCloudClient, type CloudClient } from 'jira.js';
import type { Issue } from 'jira.js/cloud';
import type {
  TrackerClient,
  ExternalIssue,
  JiraCredentials,
  TrackerIssueType,
  JiraCustomField,
  TrackerTransition,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
} from '../common/types';
import { TrackerError } from '../common/errors';
import { jiraAdfCodec } from '../../documents';
import { getConfig } from '../../config';

const DEFAULT_BATCH_SIZE = 50;
const CREATE_META_PAGE_SIZE = 100;

/**
 * Per-issue create/update trace. Silent unless `claude.debug` is on — it fires
 * once per issue during a sync and echoes the full field payload; failures still
 * surface via console.error below.
 */
function jiraLog(...args: unknown[]): void {
  if (getConfig().claude.debug) console.log(...args);
}

/**
 * Jira option/select custom fields require values wrapped as { id: "<option-id>" }.
 * We store the option ID directly, so we need to wrap numeric IDs.
 */
function wrapJiraCustomFieldValues(values: Record<string, string>): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(values)) {
    if (!value) continue;
    if (/^\d+$/.test(value)) {
      formatted[fieldId] = { id: value };
    } else {
      formatted[fieldId] = value;
    }
  }
  return formatted;
}

/**
 * Jira issue shape from API response.
 * Only includes fields we actually use (jira.js types are overly complex, and
 * mark almost everything optional because the OpenAPI spec does).
 */
interface JiraIssueResponse {
  key: string;
  id: string;
  fields: {
    summary: string;
    description?: unknown; // ADF format
    issuetype?: { name?: string };
    status?: { name?: string };
    assignee?: JiraUser | null;
    creator?: JiraUser | null;
    parent?: {
      key: string;
      fields?: { issuetype?: { name?: string } };
    };
    updated: string;
    customfield_10014?: string; // Epic link (common field)
  };
}

interface JiraUser {
  accountId?: string;
  displayName?: string;
  avatarUrls?: {
    '48x48'?: string;
    '32x32'?: string;
    '24x24'?: string;
    '16x16'?: string;
  };
}

function getJiraFieldErrors(error: unknown): Record<string, string> | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  if ('errors' in error && error.errors && typeof error.errors === 'object') {
    return error.errors as Record<string, string>;
  }

  // jira.js 6 keeps Atlassian's payload on ApiError.body instead of hoisting it.
  if (
    'body' in error &&
    error.body &&
    typeof error.body === 'object' &&
    'errors' in error.body &&
    error.body.errors &&
    typeof error.body.errors === 'object'
  ) {
    return error.body.errors as Record<string, string>;
  }

  return undefined;
}

function isResolutionScreenError(error: unknown): boolean {
  const resolutionError = getJiraFieldErrors(error)?.resolution;
  return typeof resolutionError === 'string' && resolutionError.includes('cannot be set');
}

/**
 * Jira rejects the whole create when `assignee` isn't on the project's create
 * screen or the user isn't assignable there. It reports that as a field error,
 * which also tells us nothing was created — so a retry cannot duplicate the
 * issue. Keep this narrow: a broader match would retry real failures.
 */
function assigneeFieldError(error: unknown): string | undefined {
  const assigneeError = getJiraFieldErrors(error)?.assignee;
  return typeof assigneeError === 'string' ? assigneeError : undefined;
}

export class JiraClient implements TrackerClient {
  readonly type = 'jira' as const;
  readonly documentCodec = jiraAdfCodec;
  private client: CloudClient;
  private siteUrl: string;
  private accountIdPromise: Promise<string | null> | null = null;

  constructor(credentials: JiraCredentials) {
    this.siteUrl = credentials.siteUrl;
    this.client = createCloudClient({
      host: `https://${credentials.siteUrl}`,
      auth: {
        type: 'basic',
        email: credentials.email,
        apiToken: credentials.apiToken,
      },
      // Jira's response shapes vary by tenant config, so a mismatch is routine
      // and the body still comes back unvalidated. Route it through the debug
      // gate rather than silencing it: a shape change is worth seeing when a
      // sync starts returning nonsense.
      onSchemaMismatch: (report) => jiraLog('[JiraClient] Jira response shape drift:', report),
    });
  }

  async fetchChildrenByParents(parentKeys: string[]): Promise<ExternalIssue[]> {
    if (parentKeys.length === 0) return [];
    const results: ExternalIssue[] = [];
    for (let i = 0; i < parentKeys.length; i += DEFAULT_BATCH_SIZE) {
      const batch = parentKeys.slice(i, i + DEFAULT_BATCH_SIZE);
      const jql = `parent in (${batch.join(',')})`;
      for await (const child of this.fetchIssuesByJql(jql)) {
        results.push(child);
      }
    }
    return results;
  }

  formatCustomFieldsForApi(values: Record<string, string>): Record<string, unknown> {
    return wrapJiraCustomFieldValues(values);
  }

  /**
   * The account id behind these credentials, resolved once per client. Returns
   * null if the lookup fails, so a self-assignment preference can degrade to an
   * unassigned issue instead of failing the export.
   */
  private async getOwnAccountId(): Promise<string | null> {
    this.accountIdPromise ??= this.client.myself
      .getCurrentUser()
      .then((user) => user.accountId ?? null)
      .catch((error: unknown) => {
        console.warn('[JiraClient] Could not resolve own account id for assignment:', error);
        return null;
      });
    return this.accountIdPromise;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.myself.getCurrentUser();
      return { success: true };
    } catch (error) {
      const trackerError = TrackerError.fromJiraError(error);
      return { success: false, error: trackerError.userMessage };
    }
  }

  async getAvailableProjects(): Promise<{ key: string; name: string }[]> {
    try {
      const result = await this.client.projects.searchProjects();
      return result.values?.map(p => ({ key: p.key!, name: p.name! })) ?? [];
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  async searchIssues(projectKey: string, jql?: string): Promise<ExternalIssue[]> {
    try {
      const baseJql = `project = ${projectKey}`;
      const fullJql = jql ? `${baseJql} AND ${jql}` : baseJql;

      const result = await this.client.issueSearch.searchAndReconsileIssuesUsingJql({
        jql: fullJql,
        maxResults: 100,
        fields: ['*navigable'],
      });

      return result.issues?.map(issue => this.mapIssue(issue)) ?? [];
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  async *fetchIssues(projectKey: string): AsyncGenerator<ExternalIssue> {
    yield* this.fetchIssuesByJql(`project = ${projectKey}`);
  }

  async *fetchIssuesByJql(jql: string): AsyncGenerator<ExternalIssue> {
    let nextPageToken: string | undefined;
    const maxResults = 100;

    while (true) {
      let result;
      try {
        result = await this.client.issueSearch.searchAndReconsileIssuesUsingJql({
          jql,
          maxResults,
          nextPageToken,
          fields: ['*navigable'],
        });
      } catch (error) {
        throw TrackerError.fromJiraError(error);
      }

      for (const issue of result.issues ?? []) {
        yield this.mapIssue(issue);
      }

      // New API uses nextPageToken instead of startAt
      if (!result.nextPageToken) break;
      nextPageToken = result.nextPageToken;
    }
  }

  async fetchIssue(issueKey: string): Promise<ExternalIssue> {
    try {
      const issue = await this.client.issues.getIssue({ issueIdOrKey: issueKey });
      return this.mapIssue(issue);
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  private mapIssue(raw: Issue): ExternalIssue {
    const issue = raw as unknown as JiraIssueResponse;
    return {
      key: issue.key,
      id: issue.id,
      title: issue.fields.summary,
      description: this.documentCodec.fromExternal(issue.fields.description),
      issueType: issue.fields.issuetype?.name ?? 'Task',
      status: issue.fields.status?.name ?? 'Unknown',
      parentKey: issue.fields.parent?.key ?? null,
      epicKey: this.extractEpicKey(issue),
      assignee: this.mapUser(issue.fields.assignee),
      creator: this.mapUser(issue.fields.creator),
      updatedAt: issue.fields.updated,
      url: `https://${this.siteUrl}/browse/${issue.key}`,
    };
  }

  private mapUser(user: JiraUser | null | undefined): ExternalIssue['assignee'] {
    if (!user?.accountId && !user?.displayName) return null;
    return {
      id: user.accountId ?? user.displayName ?? 'unknown',
      name: user.displayName ?? user.accountId ?? 'Unknown',
      avatarUrl: user.avatarUrls?.['48x48'] ?? user.avatarUrls?.['32x32'] ?? user.avatarUrls?.['24x24'] ?? null,
    };
  }

  private extractEpicKey(issue: JiraIssueResponse): string | null {
    // Check parent for epic relationship
    if (issue.fields.parent?.fields?.issuetype?.name === 'Epic') {
      return issue.fields.parent.key;
    }
    // Check custom field (common pattern)
    return issue.fields.customfield_10014 ?? null;
  }

  /**
   * Search issues by text (fuzzy search on key + summary)
   */
  async searchIssuesByText(projectKey: string, searchText: string, maxResults = 50): Promise<ExternalIssue[]> {
    try {
      const trimmed = searchText.trim();

      // Check if it looks like an issue key (e.g., "PROJ-6224" or "amp-6224")
      const issueKeyPattern = /^[A-Za-z]+-\d+$/;
      const isIssueKey = issueKeyPattern.test(trimmed);

      let jql: string;
      if (isIssueKey) {
        // Search by exact key (case-insensitive in Jira)
        jql = `key = ${trimmed.toUpperCase()}`;
      } else {
        // Text search in summary only (simpler, more reliable)
        const escapedText = trimmed.replace(/"/g, '\\"');
        jql = `project = ${projectKey} AND summary ~ "${escapedText}" ORDER BY updated DESC`;
      }

      const result = await this.client.issueSearch.searchAndReconsileIssuesUsingJql({
        jql,
        maxResults,
        fields: ['*navigable'],
      });

      return result.issues?.map(issue => this.mapIssue(issue)) ?? [];
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get recent/popular issues for initial browsing
   */
  async getRecentIssues(projectKey: string, maxResults = 30): Promise<ExternalIssue[]> {
    try {
      // Simple query - just get recently updated issues from the project
      const jql = `project = ${projectKey} ORDER BY updated DESC`;

      const result = await this.client.issueSearch.searchAndReconsileIssuesUsingJql({
        jql,
        maxResults,
        fields: ['*navigable'],
      });

      return result.issues?.map(issue => this.mapIssue(issue)) ?? [];
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get all labels for a project
   */
  async getProjectLabels(projectKey: string): Promise<string[]> {
    try {
      // Jira doesn't have a direct "get labels for project" API
      // We fetch issues and collect unique labels
      const jql = `project = ${projectKey} AND labels IS NOT EMPTY ORDER BY updated DESC`;

      const result = await this.client.issueSearch.searchAndReconsileIssuesUsingJql({
        jql,
        maxResults: 100,
        fields: ['labels'],
      });

      const labelSet = new Set<string>();
      for (const issue of result.issues ?? []) {
        const labels = issue.fields?.labels as string[] | undefined;
        labels?.forEach(label => labelSet.add(label));
      }

      return Array.from(labelSet).sort();
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get all components for a project
   */
  async getProjectComponents(projectKey: string): Promise<{ id: string; name: string }[]> {
    try {
      const project = await this.client.projects.getProject({ projectIdOrKey: projectKey });
      return project.components?.map(c => ({ id: c.id!, name: c.name! })) ?? [];
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get all available statuses for a project.
   * Used for status mapping configuration.
   */
  async getProjectStatuses(projectKey: string): Promise<{ id: string; name: string; categoryKey: string }[]> {
    try {
      const result = await this.client.projects.getAllStatuses({ projectIdOrKey: projectKey });
      const statusSet = new Map<string, { id: string; name: string; categoryKey: string }>();

      // Statuses are grouped by issue type, dedupe them
      for (const issueTypeStatus of result) {
        for (const status of issueTypeStatus.statuses ?? []) {
          if (!statusSet.has(status.id!)) {
            statusSet.set(status.id!, {
              id: status.id!,
              name: status.name!,
              categoryKey: status.statusCategory?.key ?? 'undefined',
            });
          }
        }
      }

      return Array.from(statusSet.values()).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get available issue types for a project.
   * Used for type mapping configuration.
   */
  async getIssueTypes(projectKey: string): Promise<TrackerIssueType[]> {
    try {
      const project = await this.client.projects.getProject({
        projectIdOrKey: projectKey,
        expand: 'issueTypes',
      });
      return (
        project.issueTypes?.map(it => ({
          id: it.id!,
          name: it.name!,
          subtask: it.subtask ?? false,
          description: it.description ?? undefined,
          iconUrl: it.iconUrl ?? undefined,
        })) ?? []
      );
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get available custom fields for a project and issue type.
   * Returns fields with their allowed values (for select/option types).
   */
  async getCustomFields(projectKey: string, issueTypeId: string): Promise<JiraCustomField[]> {
    try {
      // Atlassian retired the single createmeta call; the replacement returns
      // one issue type's fields as a page, so drain it before mapping.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fieldMetas: any[] = [];
      let startAt = 0;
      while (true) {
        const page = await this.client.issues.getCreateIssueMetaIssueTypeId({
          projectIdOrKey: projectKey,
          issueTypeId,
          startAt,
          maxResults: CREATE_META_PAGE_SIZE,
        });
        const batch = page.fields ?? [];
        fieldMetas.push(...batch);
        startAt += batch.length;
        if (batch.length === 0 || startAt >= (page.total ?? startAt)) break;
      }

      const fields: JiraCustomField[] = [];

      for (const fieldData of fieldMetas) {
        const fieldId: string = fieldData.fieldId;
        // Only include custom fields (start with 'customfield_')
        if (!fieldId.startsWith('customfield_')) continue;

        const schemaType = fieldData.schema?.type ?? 'string';
        const customType = fieldData.schema?.custom ?? '';

        // Determine field type
        let type: JiraCustomField['type'] = 'other';
        if (schemaType === 'string') {
          type = 'string';
        } else if (schemaType === 'number') {
          type = 'number';
        } else if (schemaType === 'date' || schemaType === 'datetime') {
          type = 'date';
        } else if (schemaType === 'user') {
          type = 'user';
        } else if (schemaType === 'option' || customType.includes('select')) {
          type = 'option';
        } else if (schemaType === 'array') {
          // Check if it's a multi-select
          if (fieldData.schema?.items === 'option' || customType.includes('multiselect')) {
            type = 'array';
          } else {
            type = 'other';
          }
        }

        // Extract allowed values for select/option fields
        let allowedValues: JiraCustomField['allowedValues'];
        if (fieldData.allowedValues && Array.isArray(fieldData.allowedValues)) {
          allowedValues = fieldData.allowedValues.map((v: { id?: string; value?: string; name?: string }) => ({
            id: v.id ?? '',
            value: v.value ?? v.name ?? v.id ?? '',
          }));
        }

        // Extract default value if present
        let defaultValue: string | undefined;
        if (fieldData.defaultValue !== undefined && fieldData.defaultValue !== null) {
          if (typeof fieldData.defaultValue === 'string') {
            defaultValue = fieldData.defaultValue;
          } else if (typeof fieldData.defaultValue === 'object' && fieldData.defaultValue.id) {
            // Option fields return { id: "...", value: "..." }
            defaultValue = fieldData.defaultValue.id;
          }
        }

        fields.push({
          id: fieldId,
          name: fieldData.name ?? fieldId,
          type,
          required: fieldData.required ?? false,
          allowedValues,
          defaultValue,
        });
      }

      // Sort by required first, then by name
      return fields.sort((a, b) => {
        if (a.required !== b.required) return a.required ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Create a new issue in Jira.
   */
  async createIssue(params: CreateIssueParams): Promise<CreatedIssue> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields: any = {
        project: { key: params.projectKey },
        issuetype: { id: params.issueTypeId },
        summary: params.summary,
      };

      const description = this.documentCodec.toExternal(params.description);
      if (description !== null) {
        fields.description = description;
      }

      if (params.parentKey) {
        fields.parent = { key: params.parentKey };
      }

      if (params.labels?.length) {
        fields.labels = params.labels;
      }

      // Apply custom fields
      if (params.customFields) {
        Object.assign(fields, params.customFields);
      }

      let assigneeSkippedReason: string | undefined;
      if (params.assignToSelf) {
        const accountId = await this.getOwnAccountId();
        if (accountId) {
          fields.assignee = { accountId };
        } else {
          assigneeSkippedReason = 'Could not resolve your Jira account';
        }
      }

      // `issueFilter` and `initialStatusName` are honored by trackers that can
      // create in a chosen project/state (Linear). Jira has no create-time state
      // control, so the queued status is reached by a post-create transition.
      jiraLog('[JiraClient] Creating issue with fields:', JSON.stringify(fields, null, 2));
      let result;
      try {
        result = await this.client.issues.createIssue({ fields });
      } catch (error) {
        const rejectedAssignee = fields.assignee ? assigneeFieldError(error) : undefined;
        if (!rejectedAssignee) throw error;
        console.warn(
          `[JiraClient] Jira rejected the assignee for a new issue; creating it unassigned. ${rejectedAssignee}`
        );
        delete fields.assignee;
        result = await this.client.issues.createIssue({ fields });
        assigneeSkippedReason = rejectedAssignee;
      }
      jiraLog('[JiraClient] Issue created successfully:', result?.key);
      return {
        id: result.id,
        key: result.key,
        url: `https://${this.siteUrl}/browse/${result.key}`,
        assigneeSkippedReason,
      };
    } catch (error) {
      console.error('[JiraClient] createIssue failed. Full error:', JSON.stringify(error, null, 2));
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Update an existing issue in Jira.
   */
  async updateIssue(issueKey: string, params: UpdateIssueParams): Promise<void> {
    try {
      const fields: Record<string, unknown> = {};

      if (params.summary !== undefined) {
        fields.summary = params.summary;
      }

      if (params.description !== undefined) {
        fields.description = this.documentCodec.toExternal(params.description);
      }

      if (params.labels !== undefined) {
        fields.labels = params.labels;
      }

      // Apply custom fields
      if (params.customFields) {
        Object.assign(fields, params.customFields);
      }

      jiraLog('[JiraClient] Updating issue:', issueKey, 'with fields:', JSON.stringify(fields, null, 2));
      await this.client.issues.editIssue({
        issueIdOrKey: issueKey,
        fields,
      });
      jiraLog('[JiraClient] Issue updated successfully:', issueKey);
    } catch (error) {
      console.error('[JiraClient] updateIssue failed for', issueKey, '. Full error:', JSON.stringify(error, null, 2));
      throw TrackerError.fromJiraError(error);
    }
  }

  async deleteIssue(issueKey: string): Promise<void> {
    try {
      jiraLog('[JiraClient] Deleting issue:', issueKey);
      await this.client.issues.deleteIssue({ issueIdOrKey: issueKey });
      jiraLog('[JiraClient] Issue deleted successfully:', issueKey);
    } catch (error) {
      console.error('[JiraClient] deleteIssue failed for', issueKey, '. Full error:', JSON.stringify(error, null, 2));
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get available workflow transitions for an issue.
   * Returns only transitions valid from the issue's current status.
   */
  async getTransitions(issueKey: string): Promise<TrackerTransition[]> {
    try {
      const result = await this.client.issues.getTransitions({
        issueIdOrKey: issueKey,
      });

      return (result.transitions ?? []).map((t) => ({
        id: t.id!,
        name: t.name!,
        to: {
          id: t.to!.id!,
          name: t.to!.name!,
          statusCategory: {
            key: t.to!.statusCategory?.key ?? 'undefined',
            name: t.to!.statusCategory?.name ?? 'Unknown',
          },
        },
      }));
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Transition an issue to a new status via workflow transition.
   * If transitioning to a "done" category status, includes the "Done" resolution.
   */
  async transitionIssue(issueKey: string, transitionId: string, toDoneCategory = false): Promise<void> {
    const request: {
      issueIdOrKey: string;
      transition: { id: string };
      fields?: { resolution?: { name: string } };
    } = {
      issueIdOrKey: issueKey,
      transition: { id: transitionId },
    };

    if (toDoneCategory) {
      request.fields = {
        resolution: { name: 'Done' },
      };
    }

    try {
      await this.client.issues.doTransition(request);
    } catch (error) {
      if (toDoneCategory && request.fields?.resolution && isResolutionScreenError(error)) {
        console.warn(
          `[JiraClient] Transition ${transitionId} for ${issueKey} rejected the resolution field; retrying without resolution.`
        );
        await this.client.issues.doTransition({
          issueIdOrKey: issueKey,
          transition: { id: transitionId },
        });
        return;
      }

      // Log the raw error for debugging
      console.error(`[JiraClient] transitionIssue failed for ${issueKey} with transitionId ${transitionId}:`, JSON.stringify(error, null, 2));
      throw TrackerError.fromJiraError(error);
    }
  }
}
