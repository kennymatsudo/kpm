import { Version3Client } from 'jira.js';
import type {
  TrackerClient,
  ExternalIssue,
  JiraIssueType,
  JiraTransition,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,

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

      const result = await this.client.issues.createIssue({ fields });
      return {
      };
    } catch (error) {
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

      await this.client.issues.editIssue({
        issueIdOrKey: issueKey,
        fields,
      });
    } catch (error) {
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
   */
    } catch (error) {
      throw TrackerError.fromJiraError(error);
    }
  }
}
