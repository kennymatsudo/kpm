// Shared types used across main, preload, and renderer processes
// Core types are imported from base-types (base domain types)

// Import core types from base types module
import type {
  StatusCategory,
  TrackerType as TrackerTypeBase,
  Project as ProjectBase,
  PlanItem as PlanItemBase,
} from './base-types';

// Re-export core types from base types

// =============================================================================
// =============================================================================

export type ClaudeModel = 'opus' | 'sonnet';

// =============================================================================
// External Tracker Types
// =============================================================================

// Re-export TrackerType from shared package
export type TrackerType = TrackerTypeBase;

/** Tracker type constants to avoid magic strings */
export const TRACKER_TYPES = {
  JIRA: 'jira',
  LINEAR: 'linear',
} as const satisfies Record<string, TrackerType>;

/** Unified progress callback for import/sync operations */
export type TrackerProgressCallback = (data: {
  projectId: string;
  associationId: string;
  phase: 'fetching' | 'analyzing' | 'importing' | 'complete';
  current?: number;
  total?: number;
}) => void;

// =============================================================================
// =============================================================================

/**
 * project_id = null means global template.
 */
  id: string;
  project_id: string | null;  // null = global template
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}


/**
 * Determines if an external issue type represents a "subtask" that must be nested under a parent.
 * This is tracker-agnostic - add patterns for each supported tracker.
 *
 * Jira: "Sub-task" is a special issue type that must have a parent
 * Linear: "sub_issue" or subtask patterns (to be confirmed)
 */
export function isSubtaskIssueType(issueType: string | null | undefined): boolean {
  if (!issueType) return false;
  const normalized = issueType.toLowerCase();
  return (
    normalized === 'sub-task' ||       // Jira standard
    normalized === 'subtask' ||        // Jira variations
    normalized === 'sub_task' ||
    normalized === 'sub-issue' ||      // Linear
    normalized === 'subissue'
  );
}

// Credentials are now stored in OS keychain via keytar.
// This interface is for the non-sensitive info returned to renderer.
export interface TrackerCredentialInfo {
  type: TrackerType;
  site_url?: string;
  email?: string;
  configured: boolean;
}

// =============================================================================
// Three-Level Tracker Architecture (ADR-002)
// =============================================================================

/** Level 1: Site-level connection (credentials in OS keychain) */
export interface TrackerConnection {
  id: string;
  tracker_type: TrackerType;
  site_url: string;               // 'company.atlassian.net'
  display_name: string | null;    // Human-friendly name
  created_at: string;
}

/** Level 2: Tracker project authorization scope */
export interface TrackerProjectScope {
  id: string;
  connection_id: string;
  project_key: string;            // 'PROJ'
  project_name: string | null;    // 'Sample Project'
  created_at: string;
}

/**
 * Stored as JSON on tracker_associations.
 * Used for both pushing status changes to Jira and inferring category from Jira status.
 */
export interface StatusMapping {
  not_started?: string;   // Jira status name for "Not Started" (e.g., "To Do")
  in_progress?: string;   // Jira status name for "In Progress" (e.g., "In Progress")
  done?: string;          // Jira status name for "Done" (e.g., "Done")
  blocked?: string;       // Jira status name for "Blocked" (e.g., "On Hold")
  canceled?: string;      // Jira status name for "Canceled" (e.g., "Won't Do")
}

/** Custom field values stored as JSON { fieldId: value }. Applied project-wide to all issue types. */
export type CustomFieldValues = Record<string, string>;

/** Jira custom field definition (for configuration UI) */
export interface JiraCustomField {
  id: string;              // 'customfield_10697'
  name: string;            // 'R&D Team'
  type: 'string' | 'option' | 'array' | 'number' | 'date' | 'user' | 'other';
  required: boolean;
  defaultValue?: string;   // Default value (option ID for selects, text for strings)
}

export interface TrackerAssociation {
  id: string;
  kpm_project_id: string;
  scope_id: string;
  jql_filter: string;             // 'parent = PROJ-6224'
  display_name: string | null;    // 'Support Pane Epic'
  status_mapping: StatusMapping | null;  // Explicit status category → Jira status mapping
  custom_field_values: CustomFieldValues | null;  // Static custom field values for export, applied to all issue types
  last_synced_at: string | null;
  created_at: string;
}

/** Association with joined scope and connection info for display */
export interface TrackerAssociationWithScope extends TrackerAssociation {
  project_key: string;            // From scope
  project_name: string | null;    // From scope
  site_url: string;               // From connection
}

export interface ImportPreview {
  tracker_type: TrackerType;
  external_project_key: string;
  issues_by_type: ImportIssueTypeGroup[];
  total_count: number;
}

export interface ImportIssueTypeGroup {
  type: string;           // 'Epic', 'Story', 'Task', 'Sub-task', etc.
  count: number;
  selected: boolean;      // User toggles which types to import
  issues: ImportIssuePreview[];  // For expandable preview
}

export interface ImportIssuePreview {
  key: string;
  title: string;
  parent_key: string | null;  // Shows sub-task relationships
}

export interface ImportResult {
  success: boolean;
  created: number;
  errors: { external_key: string; error: string }[];
}

// =============================================================================
// Sync Types (Phase 2)
// =============================================================================

export interface SyncSnapshot {
  id: string;
  plan_item_id: string;
  snapshot_title: string | null;
  snapshot_description: string | null;
  snapshot_label: string | null;
  snapshot_release_tag: string | null;
  external_updated_at: string | null;
  snapshot_at: string;
}

export interface SyncPreview {
  tracker_type: TrackerType;
  link_id: string;
  external_project_key: string;
  new_items: SyncNewItem[];
  updated_items: SyncUpdatedItem[];
  conflicts: SyncConflict[];
  deleted_in_tracker: PlanItem[];
  stats: {
    total: number;
    new: number;
    updated: number;
    conflicts: number;
    deleted: number;
    unchanged: number;
  };
}

export interface SyncNewItem {
  external_key: string;
  title: string;
  description: string | null;
  label?: string | null;                // Optional - we use external_issue_type directly
  external_issue_type: string;          // Original issue type: 'Story', 'Sub-task', etc.
  external_status: string;
  external_parent_key: string | null;
  external_epic_key: string | null;
}

export interface SyncUpdatedItem {
  plan_item_id: string;
  external_key: string;
  title: string;
  changes: {
    old_value: string | null;
    new_value: string | null;
  }[];
}

export interface SyncConflict {
  plan_item_id: string;
  external_key: string;
  title: string;
  fields: {
    field: 'title' | 'description' | 'label' | 'release_tag';
    your_value: string | null;
    tracker_value: string | null;
    // snapshot_value intentionally NOT included - internal only for detection
  }[];
}

export type ConflictResolution = 'keep_mine' | 'use_theirs';
export type DeletedItemAction = 'keep_local' | 'delete' | 'decide_each';

export interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  deleted: number;
  errors: { external_key: string; error: string }[];
}

// =============================================================================
// Core Domain Types
// =============================================================================

// Extend base Project with required session token fields for main app
export interface Project extends ProjectBase {
  session_tokens: number;
  session_input_tokens: number;
  session_output_tokens: number;
}

export interface Repo {
  id: string;
  project_id: string;
  path: string;
  created_at?: string;
}

export interface Attachment {
  id: string;
  project_id: string;
  path: string;
  filename: string;
  created_at?: string;
}

// Extend base PlanItem with required fields for main app
export interface PlanItem extends PlanItemBase {
  association_id: string | null;
  external_issue_type: string | null;
  external_parent_key: string | null;
  external_epic_key: string | null;
  sync_source: 'local' | TrackerType;
  last_synced_at: string | null;
}


// Type-safe updates for plan items (subset of fields that can be updated)
export type PlanItemUpdates = Partial<Pick<PlanItem,
  | 'title'
  | 'description'
  | 'label'
  | 'status'
  | 'status_category'
  | 'release_tag'
  | 'parent_id'
  | 'item_order'
  | 'code_refs'
  | 'position_x'
  | 'position_y'
>>;

// Extended updates for sync operations (includes external tracker fields)
export type PlanItemSyncUpdates = PlanItemUpdates & Partial<Pick<PlanItem,
  | 'external_key'
  | 'external_id'
  | 'external_type'
  | 'external_status'
  | 'external_url'
  | 'association_id'
  | 'sync_source'
  | 'last_synced_at'
>>;

// =============================================================================
// Chat Activity Types - for showing parallel tool execution in UI
// =============================================================================


export interface Activity {
  id: string;
  type: ActivityType;
  label: string;
  detail?: string;
}

// =============================================================================
// Plan Actions - structured commands for AI-driven plan manipulation
export type PlanAction =
  | { type: 'reparent'; item_id: string; new_parent_id: string | null }
  | { type: 'set_label'; item_id: string; label: string }
  | { type: 'set_release'; item_id: string; release_tag: string | null }
  | { type: 'add_dependency'; from_id: string; to_id: string; relation_type: 'depends_on' | 'blocks' | 'relates_to' }
  | { type: 'remove_dependency'; relation_id: string }
  | { type: 'reorder'; item_id: string; after_item_id: string | null }
  | { type: 'delete_item'; item_id: string }
  | { type: 'set_position'; item_id: string; x: number; y: number }

export interface PlanActionResponse {
  message: string;
  actions: PlanAction[];
}

// Result from executing plan actions
export interface PlanActionResult {
  success: boolean;
  error?: string;
  // Map of placeholder IDs ($1, $2) to real IDs for newly created items
  createdIds?: Record<string, string>;
  // Actions that were skipped due to validation failures (e.g., item not found)
  skippedActions?: { index: number; type: string; reason: string }[];
}

// =============================================================================
// Tracker Export Types
// =============================================================================

export interface TrackerTypeMapping {
  id: string;
  kpm_project_id: string;
  scope_id: string;
  kpm_label: string;
  tracker_issue_type_id: string;
  tracker_issue_type_name: string;
  created_at: string;
}

/** Sync queue entry: item staged for push to Jira */
export interface SyncQueueEntry {
  id: string;
  kpm_project_id: string;
  plan_item_id: string;
  association_id: string;
  operation: 'create' | 'update';
  target_issue_type_id: string | null;
  target_issue_type_name: string | null;
  target_parent_key: string | null;
  target_status_category: StatusCategory | null;  // Status to sync to Jira
  custom_field_overrides: CustomFieldValues | null; // Per-item field overrides for export
  queued_by: 'user' | 'claude';
  queued_at: string;
  error_message: string | null;
}

/** Queue entry with joined plan item data for display */
export interface SyncQueueEntryWithPlanItem extends SyncQueueEntry {
  plan_item: {
    id: string;
    title: string;
    description: string | null;
    label: string | null;
    parent_id: string | null;
    external_key: string | null;
    external_type: string | null;
  };
}

/** Jira issue type from API */
export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
  iconUrl?: string;
}

/** Export preview item with validation status */
export interface ExportPreviewItem {
  queueEntry: SyncQueueEntry;
  planItem: PlanItem;
  resolvedType: {
    id: string;
    name: string;
  } | null;
  resolvedParent: string | null;
  validationErrors: string[];
}

/** Full export preview */
export interface ExportPreview {
  items: ExportPreviewItem[];
  warnings: string[];
  canProceed: boolean;
}

/** Export result after pushing to Jira */
export interface ExportResult {
  success: boolean;
  created: { plan_item_id: string; jira_key: string }[];
  updated: { plan_item_id: string; jira_key: string }[];
  errors: { plan_item_id: string; error: string }[];
}

// =============================================================================
// Sync Review Types (Task-by-Task Review Modal)
// =============================================================================

/** Character-level diff hunk */
export interface DiffHunk {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

/** Computed diff for a single field */
export interface FieldDiff {
  hunks: DiffHunk[];
  hasChanges: boolean;
}

/** Current values from Jira for comparison */
export interface JiraCurrentValues {
  summary: string;
  description: string | null;
  status: string;  // Current Jira status name
  updated: string; // ISO timestamp from Jira
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

/** Status transition info for sync review */
export interface StatusTransitionInfo {
  currentStatus: string;           // Current Jira status name
  availableTransition: JiraTransition | null;  // Best matching transition, null if none
  warning: string | null;          // Warning message if no valid transition
}

/** Extended preview item with Jira comparison data */
export interface SyncReviewItem extends ExportPreviewItem {
  /** For updates - fetched from Jira */
  jiraCurrent: JiraCurrentValues | null;

  /** Computed character-level diffs */
  diffs: {
    summary: FieldDiff | null;
    description: FieldDiff | null;
  } | null;

  /** Status transition info (if status change queued) */
  statusTransition: StatusTransitionInfo | null;

  /** User decision during review */
  decision: 'pending' | 'approved' | 'skipped' | 'removed';

  /** Warning: Jira was updated after last_synced_at */
  hasConflict: boolean;
}

/** Full sync review data */
export interface SyncReviewData {
  items: SyncReviewItem[];
  warnings: string[];
  canProceed: boolean;
}


export interface ChatMessage {
  id: string;
  chat_session_id: string | null;  // Groups messages into distinct sessions within a project
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** Summary of a chat session for history display */
export interface ChatSessionSummary {
  chat_session_id: string;
  first_message: string;  // First user message (truncated for display)
  message_count: number;
  created_at: string;
}

// =============================================================================
// Permission System Types
// =============================================================================

/** Permission request sent from main to renderer */
export interface PermissionRequest {
  requestId: string;
  toolName: string;
  targetPath: string | null;
  preview: string;
}

/** User action for permission request */

/** Permission response sent from renderer to main */
export interface PermissionResponse {
  requestId: string;
  action: PermissionAction;
}

// =============================================================================
// Focus System Types - for AI chat context
// =============================================================================

/**
 * A resource that the user has focused for AI chat context.
 * Multiple resources can be focused simultaneously.
 * Claude receives references only and uses tools to read content.
 */
export type FocusedResource =
  | { type: 'plan_item'; id: string; title: string }
  | { type: 'project_file'; path: string; isDirectory: boolean }
  | { type: 'document'; id: string; title: string; path: string };

// =============================================================================
// Streaming Session Types
// =============================================================================

/**
 * State of a streaming Claude session.
 *
 * State transitions:
 * - idle → connecting → ready (project open)
 * - ready → processing → ready (sending message)
 * - (any) → error (on failure)
 * - (any) → closing → idle (on disconnect)
 */
export type SessionState = 'idle' | 'connecting' | 'ready' | 'processing' | 'error' | 'closing';

// =============================================================================
// Development Session Types (Plan Item Implementation)
// =============================================================================

/**
 * Status of a development session.
 *
 * Simplified model - the system can only reliably detect:
 * - Is approval pending?
 * - Is PTY running?
 *
 * State transitions:
 * - inactive → active (user resumes)
 * - (any) → deleted (user deletes session)
 */
export type DevSessionStatus =

/**
 * Each session runs Claude Code in an isolated git worktree.
 * Sessions are normally linked to plan items; null plan_item_id is retained
 * for historical rows and PR-linked stub sessions.
 */
export interface DevSession {
  id: string;
  project_id: string;
  repo_id: string;

  // Git worktree
  worktree_path: string;
  branch_name: string;
  base_branch: string;  // Usually 'master' or 'main'

  // Status
  status: DevSessionStatus;

  // Context passed to Claude Code
  initial_instructions: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * plan_item is null for historical rows or PR-linked stub sessions.
 */
export interface DevSessionWithPlanItem extends DevSession {
  plan_item: {
    id: string;
    title: string;
    description: string | null;
    label: string | null;
    external_key: string | null;
}

// =============================================================================
// File Explorer Types
// =============================================================================

/**
 * A node in the file explorer tree.
 */
export interface FileNode {
  /** File or folder name */
  name: string;
  /** Relative path from project root */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Whether this is a symlink */
  isSymlink: boolean;
  /** For symlinks, the target path */
  symlinkTarget?: string;
  /** Whether a symlink is broken (target doesn't exist) */
  isSymlinkBroken?: boolean;
  /** Children (only populated for directories when expanded) */
  children?: FileNode[];
  /** Last modified timestamp (ISO string) */
  modifiedAt: string;
  /** File size in bytes (0 for directories) */
  size: number;
}

export type SearchEntityType = 'plan_item' | 'document';
