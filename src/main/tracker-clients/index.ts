// Types
export type {
  TrackerType,
  ExternalIssue,
  TrackerClient,
  TrackerCredentials,
  JiraIssueType,
  JiraTransition,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
} from './common/types';

// Errors
export { TrackerError, type TrackerErrorCode } from './common/errors';

// Credentials
export type { CredentialProvider } from './common/credentials/index';
export { KeytarCredentialProvider } from './common/credentials/keytar-provider';

// Jira
export { JiraClient } from './jira/client';
