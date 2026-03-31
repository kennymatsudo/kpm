// Shared types used across main, preload, and renderer processes
// Core types are imported from base-types (base domain types)

// Import core types from base types module
import type {
  StatusCategory,
  TrackerType as TrackerTypeBase,
  Project as ProjectBase,
  PlanItem as PlanItemBase,
  Group,
} from './base-types';

// Re-export core types from base types

// =============================================================================
// =============================================================================

/** Available Claude models for chat sessions */
export type ClaudeModel = 'opus' | 'sonnet';

export interface CodexStatus {
  installed: boolean;
  authenticated: boolean;
}

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
// Task Prompt Template Types
// =============================================================================

/**
 * Task prompt template for guiding Claude when creating plan items.
 * project_id = null means global template.
 */
export interface TaskPromptTemplate {
  id: string;
  project_id: string | null;  // null = global template
  name: string;
  prompt_content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Custom Prompt Types
// =============================================================================

/** Icon types available for custom prompts in Command+K */
export type CustomPromptIcon = 'chart' | 'check' | 'document' | 'sparkles' | 'clipboard';

/**
 * Custom prompt for Command+K palette.
 * All prompts are global (no project-specific scope).
 * Built-in prompts (Weekly Update, Test Plan) cannot be deleted.
 */
export interface CustomPrompt {
  id: string;
  name: string;
  description: string | null;
  prompt_content: string;
  icon: CustomPromptIcon;
  keywords: string | null;  // Comma-separated search keywords
  is_builtin: boolean;      // Built-in prompts cannot be deleted
  sort_order: number;
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
  allowedValues?: { id: string; value: string }[];  // For select/option fields
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
  epic_key: string | null;        // Jira Epic key to assign new issues to (e.g., 'PROJ-6224')
  last_synced_at: string | null;
  created_at: string;
}

/** Association with joined scope and connection info for display */
export interface TrackerAssociationWithScope extends TrackerAssociation {
  tracker_type: TrackerType;      // From connection
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
  external_url: string;                 // Direct link to issue in tracker
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

/** Environment detection/capture mode for repos */
export type RepoEnvironmentMode = 'auto' | 'direnv' | 'nix' | 'none';

export interface Repo {
  id: string;
  project_id: string;
  path: string;
  environment_mode?: RepoEnvironmentMode;
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
  | 'group_id'
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

export type ActivityType = 'search' | 'read' | 'glob' | 'command' | 'edit' | 'thinking' | 'other';

export interface Activity {
  id: string;
  type: ActivityType;
  label: string;
  detail?: string;
}

// =============================================================================
// Tool Call Logging - structured observability for Claude tool usage
// =============================================================================

export interface ToolCallLogEntry {
  id: string;
  projectId: string;
  chatSessionId: string;
  turnIndex: number;
  toolName: string;
  toolCategory: ActivityType;
  input: Record<string, unknown>;
  filePaths: string[];
  label: string;
  detail?: string;
  timestamp: number;
}

export interface ToolCallTurnSummary {
  turnIndex: number;
  chatSessionId: string;
  totalCalls: number;
  byCategory: Partial<Record<ActivityType, number>>;
  uniqueFilePaths: string[];
  duplicateReads: string[];
  startTime: number;
  endTime: number;
}

// =============================================================================
// Message Segment Types - for single-bubble chat with inline tool indicators
// =============================================================================

/** Text segment containing markdown content */
export interface TextSegment {
  type: 'text';
  content: string;
}

/** Activity segment showing tool use indicators inline */
export interface ActivitySegment {
  type: 'activity';
  activities: Activity[];
}

/** Thinking segment showing Claude's reasoning (collapsible in UI) */
export interface ThinkingSegment {
  type: 'thinking';
  content: string;
}


// =============================================================================
// Plan Actions - structured commands for AI-driven plan manipulation
export type PlanAction =
  // Plan item actions
  | { type: 'reparent'; item_id: string; new_parent_id: string | null }
  | { type: 'set_label'; item_id: string; label: string }
  | { type: 'set_release'; item_id: string; release_tag: string | null }
  | { type: 'add_dependency'; from_id: string; to_id: string; relation_type: 'depends_on' | 'blocks' | 'relates_to' }
  | { type: 'remove_dependency'; relation_id: string }
  | { type: 'reorder'; item_id: string; after_item_id: string | null }
  | { type: 'delete_item'; item_id: string }
  | { type: 'set_position'; item_id: string; x: number; y: number }
  | { type: 'queue_for_tracker'; item_ids: string[] }
  // Group actions (visual containers)
  | { type: 'create_group'; project_id: string; name: string; position_x: number; position_y: number; width: number; height: number }
  | { type: 'update_group'; group_id: string; updates: Partial<Pick<Group, 'name' | 'width' | 'height'>> }
  | { type: 'delete_group'; group_id: string }
  | { type: 'assign_to_group'; item_id: string; group_id: string | null };

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

/** UI view mode - indicates which view the user is currently in (for prompt customization) */

/** Persisted chat message for session recovery */
export interface ChatMessage {
  id: string;
  session_id: string;  // project_id for main chat
  chat_session_id: string | null;  // Groups messages into distinct sessions within a project
  client_message_id?: string | null; // Stable client-generated id for idempotent user retries
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

/** Chat session entity - stores Claude SDK session ID for resume functionality */
export interface ChatSession {
  id: string;  // Same as chat_session_id in chat_messages
  project_id: string;
  claude_session_id: string | null;  // Claude SDK session ID for resume
  created_at: string;
}

// =============================================================================
// Permission System Types
// =============================================================================

/** Permission request sent from main to renderer */
export interface PermissionRequest {
  requestId: string;
  projectId: string;
  toolName: string;
  targetPath: string | null;
  preview: string;
  /** SDK-provided human-readable prompt (e.g. "Claude wants to read foo.txt") */
  title?: string;
  /** SDK-provided short noun phrase for the action (e.g. "Read file") */
  displayName?: string;
  /** SDK-provided subtitle (e.g. "Claude will have read and write access to files in ~/Downloads") */
  description?: string;
}

/** User action for permission request */
export type PermissionAction = 'allow' | 'deny' | 'allow-always' | 'allow-all-remaining';

/** Permission response sent from renderer to main */
export interface PermissionResponse {
  requestId: string;
  projectId: string;
  action: PermissionAction;
}

/** A persisted "Allow Always" tool permission for a project */
export interface ToolPermission {
  id: string;
  project_id: string;
  cache_key: string;
  tool_name: string;
  label: string;
  granted_at: string;
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
  | { type: 'repo'; id: string; path?: string }  // path optional - omit to focus whole repo
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
 * A development session represents an implementation attempt.
 * Each session runs Claude Code in an isolated git worktree.
 * Sessions are normally linked to plan items; null plan_item_id is retained
 * for historical rows and PR-linked stub sessions.
 */
export interface DevSession {
  id: string;
  project_id: string;
  plan_item_id: string | null;
  repo_id: string;
  name: string | null;

  // Git worktree
  worktree_path: string;
  branch_name: string;
  base_branch: string;  // Usually 'master' or 'main'

  // Status
  status: DevSessionStatus;

  // Context passed to Claude Code
  initial_instructions: string;

  // PR tracking
  pr_number: number | null;
  pr_url: string | null;
  pr_state: string | null;      // 'OPEN' | 'CLOSED' | 'MERGED'
  review_state: string | null;  // 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'

  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Session with joined plan item data for display.
 * plan_item is null for historical rows or PR-linked stub sessions.
 */
export interface DevSessionWithPlanItem extends DevSession {
  repo_name: string | null;
  plan_item: {
    id: string;
    title: string;
    description: string | null;
    label: string | null;
    external_key: string | null;
  } | null;
}

// =============================================================================
// PR / GitHub Types
// =============================================================================

/** PR status from GitHub, cached per session */
export interface PrStatus {
  number: number;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  checksStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  additions: number;
  deletions: number;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
}

/** A review comment on a PR (line-level or top-level) */
export interface PrComment {
  id: number;
  author: string;
  body: string;
  path: string | null;    // null for top-level review comments
  line: number | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | null;
  createdAt: string;
}

/** GitHub author node type exposed in review data. */
export type GitHubAuthorType = 'User' | 'Bot' | 'Organization' | 'App' | 'Mannequin' | 'Unknown';


/**
 * User-visible workflow status for a persisted review task.
 *
 * Five states the user sees in the thread list:
 * - needs_review: new or changed thread, not yet assessed
 * - assessed: Claude has a disposition and rationale
 * - in_progress: routed to dev session for implementation
 * - ready_to_post: draft reply ready for approval
 * - done: reply posted and/or thread resolved
 */
export type ReviewTaskStatus =
  | 'needs_review'
  | 'assessed'
  | 'in_progress'
  | 'ready_to_post'
  | 'done';

/**
 * Internal bookkeeping states tracked by the service layer for orchestration.
 * These do not appear in the thread list UI.
 */
export type ReviewTaskInternalState =
  | 'assessment_running'
  | 'implementation_queued'
  | 'post_impl_running'
  | 'stale'
  | 'failed'
  | 'ignored';

/**
 * Assessment disposition for a review thread.
 *
 * - implement: real issue, fix it
 * - push_back: not worth implementing, here's why
 * - needs_user_input: ambiguous, user should decide
 */
export type ReviewDisposition = 'implement' | 'push_back' | 'needs_user_input';

/** Coarse origin for an actionable review task. */
export type ReviewTaskSource = 'human' | 'bot' | 'mixed';

/** Simple prioritization used for review task ordering. */
export type ReviewTaskPriority = 'low' | 'medium' | 'high';

/** Summary of live PR review state. */
export interface PrReviewSummary {
  totalThreads: number;
  unresolvedThreads: number;
  resolvedThreads: number;
  outdatedThreads: number;
  actionableThreads: number;
  humanThreads: number;
  botOnlyThreads: number;
  topLevelReviewCount: number;
  conversationCommentCount: number;
}

/** One comment inside a GitHub review thread. */
export interface PrReviewThreadComment {
  id: string;
  databaseId: number | null;
  url: string;
  author: string;
  authorType: GitHubAuthorType;
  authorAssociation: string | null;
  body: string;
  createdAt: string;
  replyToId: string | null;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
}

/** One GitHub review thread with its reply chain. */
export interface PrReviewThread {
  id: string;
  url: string;
  path: string | null;
  line: number | null;
  startLine: number | null;
  subjectType: string | null;
  diffSide: 'LEFT' | 'RIGHT' | null;
  isResolved: boolean;
  isOutdated: boolean;
  resolvedBy: string | null;
  updatedAt: string;
  participants: string[];
  comments: PrReviewThreadComment[];
  hasBotOnlyComments: boolean;
  hasHumanReviewerComment: boolean;
  latestCommentPreview: string | null;
}

/** Top-level review decision/comment on a PR. */
export interface PrTopLevelReview {
  id: string;
  databaseId: number | null;
  url: string;
  author: string;
  authorType: GitHubAuthorType;
  authorAssociation: string | null;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | null;
  submittedAt: string | null;
  commitOid: string | null;
}

/** General PR conversation comment outside review threads. */
export interface PrConversationComment {
  id: string;
  databaseId: number | null;
  url: string;
  author: string;
  authorType: GitHubAuthorType;
  authorAssociation: string | null;
  body: string;
  createdAt: string;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
}

/** Live GitHub review snapshot for a pull request. */
export interface PrReviewSnapshot {
  prNumber: number;
  prUrl: string;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  headOid: string;
  baseRefName: string;
  headRefName: string;
  fetchedAt: string;
  summary: PrReviewSummary;
  threads: PrReviewThread[];
  topLevelReviews: PrTopLevelReview[];
  conversationComments: PrConversationComment[];
}

/** Persisted workflow record for one actionable review thread. */
export interface ReviewTask {
  id: string;
  project_id: string;
  repo_id: string;
  session_id: string;
  pr_number: number;
  thread_id: string;
  thread_url: string;
  path: string | null;
  line: number | null;
  source: ReviewTaskSource;
  status: ReviewTaskStatus;
  internal_state: ReviewTaskInternalState | null;
  disposition: ReviewDisposition | null;
  rationale: string | null;
  draft_reply: string | null;
  priority: ReviewTaskPriority;
  title: string;
  latest_comment_preview: string | null;
  last_seen_comment_id: string | null;
  last_seen_updated_at: string;
  last_agent_run_at: string | null;
  last_posted_reply_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Session ownership for review handling of a PR. */
export interface ReviewOwnership {
  repo_id: string;
  pr_number: number;
  session_id: string;
  created_at: string;
  updated_at: string;
}

/** Latest review sync metadata cached per PR. */
export interface ReviewSyncState {
  repo_id: string;
  pr_number: number;
  session_id: string | null;
  last_fetched_at: string | null;
  last_successful_fetched_at: string | null;
  last_head_oid: string | null;
  last_review_decision: PrStatus['reviewDecision'];
  last_error: string | null;
}


/** Renderer-friendly aggregate of live review state plus workflow state. */
export interface ReviewInboxSnapshot {
  session_id: string;
  snapshot: PrReviewSnapshot | null;
  tasks: ReviewTask[];
  ownership: ReviewOwnership | null;
  sync_state: ReviewSyncState | null;
  fetched_at: string;
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

// =============================================================================
// Confluence Integration Types
// =============================================================================

/**
 * Enables bidirectional sync of document content.
 */
export interface ConfluencePageLink {
  id: string;
  project_id: string;
  document_path: string;
  site_url: string;
  space_key: string;
  page_id: string;
  page_title: string | null;
  last_synced_at: string | null;
  local_content_hash: string | null;
  remote_content_hash: string | null;
  remote_version: number | null;
  created_at: string;
}

/**
 * Preview of sync state between local document and Confluence page.
 */
export interface ConfluenceSyncPreview {
  hasConflict: boolean;
  localChanged: boolean;
  remoteChanged: boolean;
  /** True when document has never been synced (no baseline to compare against) */
  isInitialSync: boolean;
  /** True when content differs and this is initial sync - user must choose direction */
  hasContentDifference: boolean;
  localContent: string;
  remoteContent: string;
  remoteVersion: number;
}

// =============================================================================
// Global Search Types
// =============================================================================

/** Entity types that can appear in global search results */
export type SearchEntityType = 'plan_item' | 'document';

/** Tab filter for global search overlay */
export type SearchTab = 'all' | SearchEntityType;

/** A single search result from the global search */
export interface SearchResult {
  id: string;
  entityType: SearchEntityType;
  title: string;
  snippet: string | null;
  metadata: {
    statusCategory?: StatusCategory | null;
    label?: string | null;
    externalKey?: string | null;
  };
  matchedField: string;
  updatedAt: string | null;
}

/** Parameters for the global search query */
export interface SearchParams {
  projectId: string;
  query: string;
  limit?: number;
}


// =============================================================================
// Prompt Override Types
// =============================================================================

/** Prompt categories for the configurable prompts system */

/** Prompt definition info returned to the renderer */
export interface PromptDefinitionInfo {
  key: string;
  name: string;
  description: string;
  category: PromptCategory;
  hasOverride: boolean;
  variables?: { name: string; description: string }[];
}


// =============================================================================
// Briefing Types
// =============================================================================

/** Result of a briefing generation */
export interface BriefingResult {
  /** Markdown briefing text */
  summary: string;
  /** ISO timestamp of when the briefing was generated */
  generatedAt: string;
  /** Signal counts for UI badges */
  signalCounts: {
    blockedCount: number;
    staleCount: number;
    readyCount: number;
  };
}

// =============================================================================
// MCP Server Types
// =============================================================================

/** Where an MCP server comes from */
export type McpServerSource = 'claude-ai' | 'user' | 'plugin';

/** An MCP server discovered at session init or from config files */
export interface DiscoveredMcpServer {
  /** Server name as reported by SDK (e.g., "claude.ai Slack") or config key (e.g., "ticktick") */
  name: string;
  source: McpServerSource;
  status: 'connected' | 'needs-auth' | 'failed' | 'disabled' | 'pending';
  /** Tool names registered by this server */
  tools: string[];
  /** Plugin directory path (for plugin sources) */
  pluginPath?: string;
  /** Human-readable description */
  description?: string;
}

/** A user-configured MCP server from ~/.claude.json mcpServers */
export interface UserMcpServer {
  /** Server name (key in mcpServers config) */
  name: string;
  /** Server type */
  type: 'stdio' | 'sse' | 'http';
  /** Raw config from ~/.claude.json (command/args/env for stdio, url for sse/http) */
  config: Record<string, unknown>;
}

export interface McpServerPreference {
  name: string;
  enabled: boolean;
}

// =============================================================================
// Slack Triage Types
// =============================================================================

export type SlackTriageActionType = 'reply' | 'create_task' | 'update_document' | 'info_only';
export type SlackTriageStatus = 'pending' | 'approved' | 'edited' | 'dismissed' | 'executed';
export type SlackTriageContextUsed = 'plan_items' | 'triaged_topics' | 'thread_content' | 'source_code';

export interface SlackChannelLink {
  id: string;
  project_id: string;
  channel_id: string;
  channel_name: string;
  last_checked_ts: string | null;
  created_at: string;
}

export interface SlackTriageItem {
  id: string;
  channel_link_id: string;
  source_messages: string[];
  thread_ts: string | null;
  latest_reply_ts: string | null;
  author_name: string;
  source_text: string;
  topic_summary: string;
  action_type: SlackTriageActionType;
  suggested_action: unknown;
  context_used: SlackTriageContextUsed[] | null;
  status: SlackTriageStatus;
  resolved_at: string | null;
  created_at: string;
}

/** Suggested action for a reply triage item */
export interface SlackTriageReplyAction {
  reply_text: string;
  thread_ts: string | null;
}

/** Suggested action for a create_task triage item */
export interface SlackTriageCreateTaskAction {
  title: string;
  description: string;
  suggested_status: 'not_started' | 'in_progress' | 'blocked';
  suggested_parent: string | null;
  labels: string[];
}

/** Suggested action for an update_document triage item */
export interface SlackTriageUpdateDocumentAction {
  target: string;
  update_type: 'add_note' | 'update_status' | 'add_reference_link' | 'update_description';
  content: string;
  rationale: string;
}

/** An external plugin discovered from ~/.claude/plugins/ */
export interface DiscoveredPlugin {
  /** Plugin name (directory name, e.g., "slack") */
  name: string;
  /** Absolute path to the external plugin directory */
  path: string;
  /** Human-readable description from .claude-plugin/plugin.json */
  description?: string;
  /** Whether the plugin exposes MCP servers via .mcp.json */
  hasMcpServer: boolean;
  /** MCP server names defined in .mcp.json */
  serverNames: string[];
  /** Whether this plugin is enabled in Claude Code settings */
  enabledInClaudeCode: boolean;
}
