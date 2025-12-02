// Shared types used across main, preload, and renderer processes

// =============================================================================
// External Tracker Types
// =============================================================================



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

  id: string;
  connection_id: string;
  project_key: string;            // 'PROJ'
  project_name: string | null;    // 'Sample Project'
  created_at: string;
}

  id: string;
  kpm_project_id: string;
  scope_id: string;
  jql_filter: string;             // 'parent = PROJ-6224'
  display_name: string | null;    // 'Support Pane Epic'
  last_synced_at: string | null;
  created_at: string;
}

/** Association with joined scope and connection info for display */
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
  external_status: string;
  external_parent_key: string | null;
  external_epic_key: string | null;
}

export interface SyncUpdatedItem {
  plan_item_id: string;
  external_key: string;
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

  sync_source: 'local' | TrackerType;
  last_synced_at: string | null;
}


// Type-safe updates for plan items (subset of fields that can be updated)
export type PlanItemUpdates = Partial<Pick<PlanItem,
  | 'title'
  | 'description'
  | 'label'
  | 'status'
  | 'release_tag'
  | 'parent_id'
  | 'item_order'
  | 'code_refs'
  | 'position_x'
  | 'position_y'
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
// =============================================================================

  id: string;
  kpm_project_id: string;
  scope_id: string;
  kpm_label: string;
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
  updated: string; // ISO timestamp from Jira
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

