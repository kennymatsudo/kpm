// Database initialization
export { initDatabase, initDatabaseWithPath } from './connection';

// Re-export types for consumers
export type {
  Project,
  Repo,
  Attachment,
  PlanItem,
  PlanRelation,
  PlanAction,
  PlanActionResult,
} from '../../shared/types';
