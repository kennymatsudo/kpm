import { Version3Client } from 'jira.js';
import type {
  TrackerClient,
  ExternalIssue,
  JiraIssueType,
  JiraCustomField,
  JiraTransition,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
} from '../common/types';
import { TrackerError } from '../common/errors';

/**
 * Jira issue shape from API response.
 * Only includes fields we actually use (jira.js types are overly complex).
 */
interface JiraIssueResponse {
  key: string;
  id: string;
  fields: {
    summary: string;
    description?: unknown; // ADF format
    issuetype?: { name?: string };
    status?: { name?: string };
    parent?: {
      key: string;
      fields?: { issuetype?: { name?: string } };
    };
    updated: string;
    customfield_10014?: string; // Epic link (common field)
  };
}

export class JiraClient implements TrackerClient {
  readonly type = 'jira' as const;
  private client: Version3Client;
  private siteUrl: string;

    this.siteUrl = credentials.siteUrl;
    this.client = new Version3Client({
      host: `https://${credentials.siteUrl}`,
      authentication: {
        basic: {
          apiToken: credentials.apiToken,
        },
      },
    });
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

    try {
      const result = await this.client.projects.searchProjects();
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }

  async searchIssues(projectKey: string, jql?: string): Promise<ExternalIssue[]> {
    try {
      const baseJql = `project = ${projectKey}`;
      const fullJql = jql ? `${baseJql} AND ${jql}` : baseJql;

      const result = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
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
        result = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
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

  private mapIssue(issue: JiraIssueResponse): ExternalIssue {
    return {
      key: issue.key,
      id: issue.id,
      title: issue.fields.summary,
      issueType: issue.fields.issuetype?.name ?? 'Task',
      status: issue.fields.status?.name ?? 'Unknown',
      parentKey: issue.fields.parent?.key ?? null,
      epicKey: this.extractEpicKey(issue),
      updatedAt: issue.fields.updated,
      url: `https://${this.siteUrl}/browse/${issue.key}`,
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

      const result = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
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

      const result = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
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

      const result = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
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
  async getIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
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
      // Use the createmeta endpoint to get field info including allowed values
      const result = await this.client.issues.getCreateIssueMeta({
        projectKeys: [projectKey],
        issuetypeIds: [issueTypeId],
        expand: 'projects.issuetypes.fields',
      });

      const fields: JiraCustomField[] = [];
      const project = result.projects?.find(p => p.key === projectKey);
      const issueType = project?.issuetypes?.find(it => it.id === issueTypeId);

      if (!issueType?.fields) {
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fieldMap = issueType.fields as Record<string, any>;

      for (const [fieldId, fieldData] of Object.entries(fieldMap)) {
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

      console.log('[JiraClient] Creating issue with fields:', JSON.stringify(fields, null, 2));
      const result = await this.client.issues.createIssue({ fields });
      console.log('[JiraClient] Issue created successfully:', result?.key);
      return {
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
      }

      if (params.labels !== undefined) {
        fields.labels = params.labels;
      }

      // Apply custom fields
      if (params.customFields) {
        Object.assign(fields, params.customFields);
      }

      console.log('[JiraClient] Updating issue:', issueKey, 'with fields:', JSON.stringify(fields, null, 2));
      await this.client.issues.editIssue({
        issueIdOrKey: issueKey,
        fields,
      });
      console.log('[JiraClient] Issue updated successfully:', issueKey);
    } catch (error) {
      console.error('[JiraClient] updateIssue failed for', issueKey, '. Full error:', JSON.stringify(error, null, 2));
      throw TrackerError.fromJiraError(error);
    }
  }

  /**
   * Get available workflow transitions for an issue.
   * Returns only transitions valid from the issue's current status.
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
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


      await this.client.issues.doTransition(request);
    } catch (error) {
      // Log the raw error for debugging
      console.error(`[JiraClient] transitionIssue failed for ${issueKey} with transitionId ${transitionId}:`, JSON.stringify(error, null, 2));
      throw TrackerError.fromJiraError(error);
    }
  }
}
