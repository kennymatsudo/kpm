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

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
  iconUrl?: string;
}

export interface CreateIssueParams {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  description?: string;
  parentKey?: string;         // For sub-tasks or stories under epics
  labels?: string[];
}

export interface CreatedIssue {
  id: string;
  key: string;
  self: string;
}

export interface UpdateIssueParams {
  summary?: string;
  description?: string | null;  // null clears the description
  labels?: string[];
}

export interface TrackerClient {
  type: TrackerType;
  testConnection(): Promise<{ success: boolean; error?: string }>;
  fetchIssues(projectKey: string): AsyncGenerator<ExternalIssue>;
  fetchIssue(issueKey: string): Promise<ExternalIssue>;
}

  apiToken: string;
}
