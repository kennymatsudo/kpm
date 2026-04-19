// Types
export type {
  TrackerType,
  ExternalIssue,
  TrackerClient,
  TrackerCredentials,
  JiraCredentials,
  LinearCredentials,
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

// Linear
export { LinearClient } from './linear/client';
export type { LinearFilter, LinearIssueFilterInput } from './linear/filter-types';
export {
  parseLinearFilter,
  stringifyLinearFilter,
  buildLinearIssueFilter,
  buildParentIdentifierFilter,
} from './linear/filter-types';
