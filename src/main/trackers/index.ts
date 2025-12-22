// Re-export types and classes from tracker-clients module
export type {
  TrackerType,
  ExternalIssue,
  TrackerClient,
  TrackerCredentials,
  TrackerErrorCode,
} from '../tracker-clients';

export {
  JiraClient,
  TrackerError,
  KeytarCredentialProvider,
} from '../tracker-clients';

// Local exports
export { fetchIssuesWithSubtasks, DEFAULT_BATCH_SIZE, PROGRESS_REPORT_INTERVAL } from './fetchingUtils';
export {
  inferCategoryFromStatus,
  inferCategoryWithMapping,
  findTransitionWithMapping,
} from './statusTransitions';
