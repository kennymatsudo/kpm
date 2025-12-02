export type TrackerType = 'jira' | 'linear';

export interface ExternalIssue {
  id: string;
  title: string;
  description: string | null;
  status: string;
  parentKey: string | null;
  updatedAt: string;
  url: string;
}

export interface TrackerClient {
  type: TrackerType;
  testConnection(): Promise<{ success: boolean; error?: string }>;
  fetchIssues(projectKey: string): AsyncGenerator<ExternalIssue>;
  fetchIssue(issueKey: string): Promise<ExternalIssue>;
}

  apiToken: string;
}
