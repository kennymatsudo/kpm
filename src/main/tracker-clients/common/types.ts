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

/** Jira custom field definition */
export interface JiraCustomField {
  id: string;              // 'customfield_10697'
  name: string;            // 'R&D Team'
  type: 'string' | 'option' | 'array' | 'number' | 'date' | 'user' | 'other';
  required: boolean;
  defaultValue?: string;   // Default value (option ID for selects, text for strings)
}

export interface CreateIssueParams {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  description?: string;
  parentKey?: string;         // For sub-tasks or stories under epics
  labels?: string[];
  customFields?: Record<string, unknown>;  // Custom field values
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
  customFields?: Record<string, unknown>;  // Custom field values
}

/** Jira workflow transition */
export interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory: {
      key: string;  // 'new', 'indeterminate', 'done'
      name: string; // 'To Do', 'In Progress', 'Done'
    };
  };
}

export interface TrackerClient {
  type: TrackerType;
  testConnection(): Promise<{ success: boolean; error?: string }>;
  fetchIssues(projectKey: string): AsyncGenerator<ExternalIssue>;
  fetchIssue(issueKey: string): Promise<ExternalIssue>;
}

  apiToken: string;
}
