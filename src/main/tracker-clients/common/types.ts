import type { DocumentCodec } from '../../documents/types';
import type { ExternalMarkdown } from '../../documents/exportBoundary';

export type TrackerType = 'jira' | 'linear';

export interface ExternalPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ExternalIssue {
  key: string;              // 'PROJ-123' or Linear 'ENG-42'
  id: string;
  title: string;
  description: string | null;
  issueType: string;        // 'Epic', 'Story', 'Task', etc. (Jira); synthesized from labels/template for Linear
  status: string;
  statusType?: string;      // Linear workflow-state type: 'triage'|'backlog'|'unstarted'|'started'|'completed'|'canceled'
  parentKey: string | null;
  epicKey: string | null;   // Jira epic link or Linear project id
  assignee?: ExternalPerson | null;
  creator?: ExternalPerson | null;
  updatedAt: string;
  url: string;
}

export interface TrackerIssueType {
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
  allowedValues?: { id: string; value: string }[];  // For select/option fields
  defaultValue?: string;   // Default value (option ID for selects, text for strings)
}

export interface CreateIssueParams {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  /** Must cross the export boundary (`toExternalMarkdown`) so plan refs never leak (P6). */
  description?: ExternalMarkdown;
  parentKey?: string;         // For sub-tasks or stories under epics
  labels?: string[];
  customFields?: Record<string, unknown>;  // Custom field values
  /**
   * The association's stored issue filter (`project = X` for Jira,
   * `JSON.stringify(LinearFilter)` for Linear). Each client reads what it needs:
   * Linear scopes new issues to the filter's Project; other clients ignore it.
   */
  issueFilter?: string;
  /**
   * Desired initial status *name* (already resolved from the status mapping).
   * A client sets the issue's starting state to this if it can create in a
   * chosen state (Linear); clients that can't (Jira) ignore it and rely on a
   * post-create transition instead.
   */
  initialStatusName?: string;
}

export interface CreatedIssue {
  id: string;
  key: string;
  /** User-facing browse URL for the created issue. */
  url: string;
}

export interface UpdateIssueParams {
  summary?: string;
  description?: ExternalMarkdown | null;  // null clears the description
  labels?: string[];
  customFields?: Record<string, unknown>;  // Custom field values
}

/** A workflow transition (Jira) or a state change synthesized from a workflow state (Linear). */
export interface TrackerTransition {
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
  documentCodec: DocumentCodec;
  testConnection(): Promise<{ success: boolean; error?: string }>;
  getAvailableProjects(): Promise<{ key: string; name: string }[]>;
  fetchIssues(projectKey: string): AsyncGenerator<ExternalIssue>;
  /**
   * Fetch issues by a tracker-native filter string. For Jira this is JQL;
   * for Linear this is `JSON.stringify(LinearFilter)`.
   */
  fetchIssuesByJql(filter: string): AsyncGenerator<ExternalIssue>;
  fetchIssue(issueKey: string): Promise<ExternalIssue>;
  searchIssues(projectKey: string, filter?: string): Promise<ExternalIssue[]>;
  /**
   * Fuzzy text search over a project's issues (key + summary), for the browse UI's
   * search box. Linear has no separate text-search endpoint, so it falls back to
   * its standard issue query.
   */
  searchIssuesByText(projectKey: string, searchText: string): Promise<ExternalIssue[]>;
  /** Most-recently-updated issues in a project, for initial browsing before a search. */
  getRecentIssues(projectKey: string): Promise<ExternalIssue[]>;
  /** Fetch direct children for a batch of parent issue keys. Replaces JQL `parent in (...)`. */
  fetchChildrenByParents(parentKeys: string[]): Promise<ExternalIssue[]>;
  /** Wrap custom-field values for the client-native API (Jira option IDs etc.). */
  formatCustomFieldsForApi(values: Record<string, string>): Record<string, unknown>;
  // Write operations. Every supported tracker implements these — Linear
  // synthesizes `getIssueTypes` as a single "Issue" entry and
  // `getTransitions` as one pseudo-transition per workflow state so the
  // signature remains identical across trackers.
  getIssueTypes(projectKey: string): Promise<TrackerIssueType[]>;
  createIssue(params: CreateIssueParams): Promise<CreatedIssue>;
  updateIssue(issueKey: string, params: UpdateIssueParams): Promise<void>;
  getTransitions(issueKey: string): Promise<TrackerTransition[]>;
  transitionIssue(issueKey: string, transitionId: string, toDoneCategory?: boolean): Promise<void>;
  /** All workflow states/statuses for the project. Used to seed status mappings. */
  getProjectStatuses(projectKey: string): Promise<{ id: string; name: string; categoryKey: string }[]>;
}

/** Atlassian Cloud credentials (Jira and Confluence share the account). */
export interface JiraCredentials {
  type: 'jira';
  siteUrl: string;         // 'company.atlassian.net'
  email: string;
  apiToken: string;
}

/** Linear personal API key. No site URL — the API lives at api.linear.app. */
export interface LinearCredentials {
  type: 'linear';
  apiToken: string;
}

export type TrackerCredentials = JiraCredentials | LinearCredentials;
