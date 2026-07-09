// Types
export type {
  TrackerType,
  ExternalIssue,
  TrackerClient,
  TrackerCredentials,
  JiraCredentials,
  LinearCredentials,
  TrackerIssueType,
  TrackerTransition,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
} from './common/types';

export type { DocumentCodec } from '../documents';

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

// Documents
export { jiraAdfCodec, linearMarkdownCodec, normalizeMarkdown } from '../documents';
