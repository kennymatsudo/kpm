// Shared types used across main, preload, and renderer processes
// Core types are imported from base-types (base domain types)

// Import core types from base types module
import type {
  StatusCategory,
  TrackerType as TrackerTypeBase,
  Project as ProjectBase,
  PlanItem as PlanItemBase,
  AgentType,
} from './base-types';
import type { PersistedAgentReview } from './agent-types';
import type { FieldsEditableVia } from './planItemFields';

// Re-export core types from base types
export type {
  StatusCategory,
  PlanRelation,
  Group,
} from './base-types';
export { STATUS_CATEGORIES } from './base-types';
export type { AgentType, AgentSessionState, AgentSessionRole } from './base-types';
export type {
  CustomTheme,
  CustomThemeColors,
  CustomThemeSource,
  CustomThemeTokenRule,
  CustomThemeVsCodeData,
  ImportedCustomThemeResult,
} from './customThemes';

// =============================================================================
// Chat Agent Types
// =============================================================================

/** Main chat backend provider. */
export type ChatProvider = 'claude' | 'codex' | 'pi';

export const CHAT_PROVIDERS = ['claude', 'codex', 'pi'] as const satisfies readonly ChatProvider[];

/**
 * Best-effort modelId for a configured pi provider whose model catalog is still empty
 * after loading extensions (see `listPiProviders`). Not verified resolvable at
 * enumeration time — the provider's `ModelRuntime` catalog has no available
 * model to identify as its default, so this is a guess rather than an enumerated id.
 * `"auto"` matches Cursor's own alias for its default model (verified against
 * `pi-cursor-sdk`'s model catalog: the `default`/"Auto" entry lists `auto` as
 * an alias) — currently the only provider that reaches this branch, since every
 * known-native pi provider is driven by pi-ai's bundled catalog and always
 * resolves real enumerated ids here.
 *
 * If this guessed selector does not resolve later, Chat dispatch fails with an
 * actionable error. It is never substituted with another registered model.
 */
export const PI_UNRESOLVED_MODEL_ID = 'auto';

/** Available Claude models for chat sessions */
export type ClaudeModel = 'opus' | 'sonnet';

/** Chat session scope controls where a persisted conversation is surfaced. */
export type ChatSessionScope = 'main' | 'focus_document';

export const CODEX_CHAT_MODELS = [
  {
    value: 'gpt-5.6-sol',
    label: 'Sol',
    description: 'GPT-5.6 Sol — Detail and polish for complex work',
    contextWindow: 372_000,
  },
  {
    value: 'gpt-5.6-terra',
    label: 'Terra',
    description: 'GPT-5.6 Terra — Pragmatic all-rounder',
    contextWindow: 372_000,
  },
  {
    value: 'gpt-5.6-luna',
    label: 'Luna',
    description: 'GPT-5.6 Luna — Clear, repeatable work at scale',
    contextWindow: 372_000,
  },
] as const;

export type CodexChatModel = typeof CODEX_CHAT_MODELS[number]['value'];
export const DEFAULT_CODEX_CHAT_MODEL: CodexChatModel = CODEX_CHAT_MODELS[0].value;

/** Codex SDK availability/auth status */
export interface CodexStatus {
  installed: boolean;
  authenticated: boolean;
}

/**
 * Whether a chat provider is usable right now, derived from its on-disk
 * install/sign-in state. Distinct from `PROVIDER_CAPABILITIES` (what a provider
 * *can do*, static) — this is whether it *works now*, computed in the main
 * process from filesystem checks. Never reflects token contents; only presence.
 */
export type ProviderReadinessState =
  | 'ready'
  | 'installed-not-configured'
  | 'not-installed';

export interface ProviderReadiness {
  provider: ChatProvider;
  state: ProviderReadinessState;
  /** Short human-readable status, e.g. "Signed in" or "Run codex login". */
  detail: string;
}

export interface ProvidersReadiness {
  byProvider: Record<ChatProvider, ProviderReadiness>;
  /** True when at least one provider is `ready`. The "is KPM usable" signal. */
  anyReady: boolean;
}

/**
 * A pi.dev provider/model the user has configured and authenticated.
 * `provider`/`modelId` together form the `"<provider>/<modelId>"` selector
 * accepted by `chat:send`'s `providerModel` param.
 */
export interface PiProviderOption {
  provider: string;
  modelId: string;
  modelName?: string;
  label: string;
  /** Model context window reported by pi's model registry, when available. */
  contextWindow?: number;
  /**
   * True only for providers confirmed to route tool calls through pi's own
   * native tool loop, where KPM's read-only tool gate (P7) applies. See
   * `main/pi/providers.ts` for the classification mechanism.
   */
  safe: boolean;
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

/**
 * Effort level controlling how much thinking/reasoning Claude applies.
 * 'xhigh' requires Opus 4.7+ or Sonnet 5 (falls back to 'high' on older models).
 * 'max' is supported on Opus and Sonnet 5 (not Haiku).
 */
export type AgentEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Legacy Claude-chat effort vocabulary retained for app-setting compatibility. */
export type ChatEffortLevel = Exclude<AgentEffortLevel, 'xhigh'>;

/** Provider-neutral effort vocabulary persisted with a Chat model choice. */
export type ChatChoiceEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PersistedChatProviderChoice {
  model: string;
  effort: ChatChoiceEffort | null;
}

/** Versioned aggregate stored atomically on chat_sessions. */
export interface PersistedChatModelChoice {
  version: 1;
  selectedProvider: ChatProvider;
  remembered: Record<ChatProvider, PersistedChatProviderChoice>;
}

export interface ChatEffortDescriptor {
  value: ChatChoiceEffort;
  label: string;
}

export interface ChatModelDescriptor {
  id: string;
  label: string;
  available: boolean;
  unavailableReason?: string;
  effortLevels: ChatEffortDescriptor[];
  defaultEffort: ChatChoiceEffort | null;
}

export interface ChatProviderDescriptor {
  provider: ChatProvider;
  label: string;
  available: boolean;
  detail: string;
  models: ChatModelDescriptor[];
}

/** Authoritative renderer projection of one persisted Chat model choice. */
export interface ChatChoiceView {
  revision: number;
  selected: {
    provider: ChatProvider;
    model: string;
    effort: ChatChoiceEffort | null;
  };
  remembered: Record<ChatProvider, PersistedChatProviderChoice>;
  providers: ChatProviderDescriptor[];
  controlsEnabled: boolean;
  responding: boolean;
  send: { allowed: boolean; reason?: string };
}

export type ChatChoiceIntent =
  | { type: 'choose_provider'; provider: ChatProvider }
  | { type: 'choose_model'; model: string }
  | { type: 'choose_effort'; effort: ChatChoiceEffort };

/** Opposing-agent review policy for a board implementation session. */
export type AgentReviewPolicy = 'auto' | 'skip';

// =============================================================================
// Custom Prompt Types
// =============================================================================

/** Icon types available for custom prompts in Command+K */
export type CustomPromptIcon = 'chart' | 'check' | 'document' | 'sparkles' | 'clipboard';

/** Entity a custom prompt runs on. Picked in the palette before the prompt runs. */
export type CustomPromptTargetType = 'none' | 'document' | 'repo';

/**
 * How a custom prompt executes.
 * - 'artifact': background generation task that writes a file (original pipeline)
 * - 'chat': sent as a chat message, with the picked target attached as a focused resource
 */
export type CustomPromptRunMode = 'artifact' | 'chat';

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
  target_type: CustomPromptTargetType;
  run_mode: CustomPromptRunMode;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Scheduled Loop Types
// =============================================================================

/**
 * What a scheduled loop does with each run's result. Also bounds which tools
 * the loop's agent turn may use, so it doubles as a safety boundary:
 * - 'notify':   read-only; summarizes findings into an alert (silent if nothing)
 * - 'report':   read-only + writes/refreshes the loop's own markdown doc
 * - 'maintain': may propose plan/document changes through the approval flow
 */
export type LoopOutputMode = 'notify' | 'report' | 'maintain';

/** Outcome of a single loop run. 'no_op' means the run completed but found nothing worth surfacing. */
export type LoopRunOutcome = 'ok' | 'no_op' | 'error';

/**
 * A scheduled loop: a freeform prompt that runs on an interval against a
 * project. Created and managed from the Command+K palette. Project-scoped
 * (unlike global CustomPrompts) because each run needs a project's repos,
 * documents, and outputs/ folder.
 */
export interface ScheduledLoop {
  id: string;
  project_id: string;
  name: string;
  prompt: string;
  output_mode: LoopOutputMode;
  interval_minutes: number;
  enabled: boolean;
  last_run_at: string | null;
  last_outcome: LoopRunOutcome | null;
  last_error: string | null;
  /** Compact carried-forward state from previous runs, written back by the agent after each run. */
  memory: string | null;
  created_at: string;
  updated_at: string;
}

/** A single execution of a scheduled loop, retained for history/triage. */
export interface LoopRun {
  id: string;
  loop_id: string;
  outcome: LoopRunOutcome;
  /** Short human-readable summary of what the run found or did. */
  summary: string | null;
  /** Fuller detail behind the summary (e.g. the notify body), when available. */
  detail: string | null;
  error: string | null;
  /** Relative path of the doc written, for 'report' runs. */
  artifact_path: string | null;
  started_at: string;
  finished_at: string | null;
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * A single user-facing notification, produced by `NotificationService` from an
 * `UpdateEvent` and broadcast to renderer windows over `notification:new`.
 * Kind-agnostic — new event sources (loops today; trackers, reviews, etc. in
 * the future) all funnel through this same shape rather than each inventing
 * their own notification payload.
 */
export interface AppNotification {
  /** Stable id for this notification instance. */
  id: string;
  /** When the underlying event was detected. */
  at: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  /** Source system, propagated from the originating event (e.g. 'loop'). */
  source: string;
  /** Original event kind, for consumers that want to filter. */
  eventKind: string;
  /** Optional deep-link target — opaque to the service, interpreted by UI. */
  link?: { kind: 'session' | 'plan_item' | 'pr' | 'external'; id: string };
}

// StatusCategory is re-exported from @kpm/shared-types above

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
 * Explicit mapping between KPM status categories and Jira status names.
 * Stored as JSON on tracker_associations.
 * Used for both pushing status changes to Jira and inferring category from Jira status.
 */
export interface StatusMapping {
  not_started?: string;   // Jira status name for "Not Started" (e.g., "To Do")
  in_progress?: string;   // Jira status name for "In Progress" (e.g., "In Progress")
  in_review?: string;     // Jira status name for "In Review" (e.g., "Code Review")
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

/** Level 3: Filter-based association linking KPM project to tracker issues */
export interface TrackerAssociation {
  id: string;
  kpm_project_id: string;
  scope_id: string;
  issue_filter: string;           // Tracker-native filter: JQL (Jira) or serialized LinearFilter (Linear)
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
  status_category: StatusCategory;
  external_url: string;                 // Direct link to issue in tracker
  external_parent_key: string | null;
  external_epic_key: string | null;
  external_assignee_id?: string | null;
  external_assignee_name?: string | null;
  external_assignee_avatar_url?: string | null;
  external_creator_id?: string | null;
  external_creator_name?: string | null;
  external_creator_avatar_url?: string | null;
}

export interface SyncUpdatedItem {
  plan_item_id: string;
  external_key: string;
  title: string;
  changes: {
    field: 'title' | 'description' | 'label' | 'release_tag' | 'external_status' | 'status_category' | 'external_assignee_id' | 'external_assignee_name' | 'external_assignee_avatar_url' | 'external_creator_id' | 'external_creator_name' | 'external_creator_avatar_url';
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
  active_worktree_path?: string | null;
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
  external_assignee_id?: string | null;
  external_assignee_name?: string | null;
  external_assignee_avatar_url?: string | null;
  external_creator_id?: string | null;
  external_creator_name?: string | null;
  external_creator_avatar_url?: string | null;
  sync_source: 'local' | TrackerType;
  last_synced_at: string | null;
}

// PlanRelation is re-exported from @kpm/shared-types above

// Type-safe updates for plan items (subset of fields that can be updated)
export type PlanItemUpdates = Partial<Pick<PlanItem, FieldsEditableVia<'ipc'>>>;

// Shape accepted by IPlanItemRepository.add() — identity + placement fields are
// required, everything else (including sync/external fields) defaults at the
// repository's INSERT layer. See planItemFields.ts.
export type NewPlanItem = Pick<PlanItem, 'id' | 'project_id' | 'title' | 'item_order'> &
  Partial<Omit<PlanItem, 'id' | 'project_id' | 'title' | 'item_order' | 'created_at' | 'updated_at'>>;

// Extended updates for sync operations (includes external tracker fields)
export type PlanItemSyncUpdates = PlanItemUpdates & Partial<Pick<PlanItem,
  | 'external_key'
  | 'external_id'
  | 'external_type'
  | 'external_status'
  | 'external_url'
  | 'external_assignee_id'
  | 'external_assignee_name'
  | 'external_assignee_avatar_url'
  | 'external_creator_id'
  | 'external_creator_name'
  | 'external_creator_avatar_url'
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
  /** Diff line counts surfaced by the SDK for Edit/Write tools. */
  diffStats?: {
    additions: number;
    deletions: number;
  };
  /** Diff hunk lines (each prefixed `+`, `-`, or ` `) from the SDK's structuredPatch — for inline diff rendering. */
  diffHunks?: string[];
  /** Live wall-clock seconds a still-running tool has been executing, from the SDK's tool_progress heartbeat. Only set while the tool is in flight. */
  elapsedSeconds?: number;
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

/**
 * Marks a turn boundary inside a message whose consecutive assistant turns
 * were merged into one card (no intervening user message). Renders as an
 * inline divider carrying the timing/progress signal instead of a repeated
 * header. `durationMs`/`model` describe the turn that just finished.
 */
export interface CheckpointSegment {
  type: 'checkpoint';
  timestamp: number;
  durationMs?: number;
  model?: string;
}

/** A segment within a message - text, activity indicator, thinking block, or turn-boundary checkpoint */
export type MessageSegment = TextSegment | ActivitySegment | ThinkingSegment | CheckpointSegment;

// =============================================================================
// Plan Actions - structured commands for AI-driven plan manipulation
//
// Derived from PLAN_ACTION_REGISTRY in shared/planActionSchema.ts — the Zod
// schema there is the source of truth for both this type and IPC validation.
import type { PlanAction } from './planActionSchema';
export type { PlanAction } from './planActionSchema';

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

/** Type mapping: KPM label -> Tracker issue type */
export interface TrackerTypeMapping {
  id: string;
  kpm_project_id: string;
  scope_id: string;
  kpm_label: string;
  tracker_issue_type_id: string;
  tracker_issue_type_name: string;
  created_at: string;
}

/** The three tracker mutations an Outbound Change can carry. */
export type OutboundChangeOperation = 'create' | 'update' | 'delete';

/**
 * Outbound Change: a pending tracker mutation staged for push. Create and
 * update carry a live plan item (`plan_item_id`); delete rows are detached
 * (`plan_item_id` is null) and snapshot the external identity being removed.
 */
export interface OutboundChange {
  id: string;
  kpm_project_id: string;
  plan_item_id: string | null;
  association_id: string;
  operation: OutboundChangeOperation;
  target_issue_type_id: string | null;
  target_issue_type_name: string | null;
  target_parent_key: string | null;
  target_status_category: StatusCategory | null;  // Status to sync to Jira
  custom_field_overrides: CustomFieldValues | null; // Per-item field overrides for export
  queued_by: 'user' | 'claude';
  queued_at: string;
  error_message: string | null;
  external_key: string | null;   // Snapshot of the target issue key (delete rows)
  external_id: string | null;    // Snapshot of the target issue id (delete rows)
  tracker_type: string | null;   // Snapshot of the tracker (delete rows)
}

/**
 * Narrows to create/update Outbound Changes — those carrying a live plan item —
 * and excludes detached delete rows. The create/update export path uses this to
 * drop delete rows, which are drained separately.
 */
export function hasLivePlanItem<T extends { plan_item_id: string | null }>(
  change: T
): change is T & { plan_item_id: string } {
  return change.plan_item_id !== null;
}

/**
 * Outbound Change joined with its live plan item, for display. Only create and
 * update rows join, so `plan_item_id` is always present here.
 */
export interface OutboundChangeWithPlanItem extends Omit<OutboundChange, 'plan_item_id'> {
  plan_item_id: string;
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

/** An issue type from a tracker (Jira issue types; Linear synthesizes a single "Issue"). */
export interface TrackerIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description?: string;
  iconUrl?: string;
}

/** Export preview item with validation status */
export interface ExportPreviewItem {
  queueEntry: OutboundChange;
  planItem: PlanItem;
  resolvedType: {
    id: string;
    name: string;
  } | null;
  resolvedParent: string | null;
  /** Description after export-boundary @plan resolution, matching the tracker payload. */
  resolvedDescription: string | null;
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
  statusType?: string | null; // Linear workflow-state type, when available
  updated: string; // ISO timestamp from Jira
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

/** Status transition info for sync review */
export interface StatusTransitionInfo {
  currentStatus: string;           // Current Jira status name
  targetCategory: StatusCategory;  // KPM category to transition to
  availableTransition: TrackerTransition | null;  // Best matching transition, null if none
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
export type ChatViewMode = 'plan' | 'workspace' | 'focus';

export interface FocusChatDocument {
  path: string;
  title: string;
  content: string;
}

/**
 * A file attachment sent with a chat message.
 *
 * Discriminated by `kind`:
 * - `image`: rendered as a vision content block (PNG/JPEG/GIF/WebP only — the SDK
 *   does not accept BMP).
 * - `pdf`: rendered as a document content block (base64 PDF).
 * - `text`: read as UTF-8 and inlined as a wrapped text block.
 */
export type ChatAttachment =
  | {
      kind: 'image';
      path: string;
      filename: string;
      mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    }
  | { kind: 'pdf'; path: string; filename: string }
  | { kind: 'text'; path: string; filename: string; mediaType: string };

/** Persisted chat message for session recovery */
export interface ChatMessage {
  id: string;
  session_id: string;  // project_id for main chat
  chat_session_id: string | null;  // Groups messages into distinct sessions within a project
  client_message_id?: string | null; // Stable client-generated id for idempotent user retries
  provider: ChatProvider;
  /** Concrete model that produced an assistant turn; null for users and legacy rows. */
  model?: string | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** Summary of a chat session for history display */
export interface ChatSessionSummary {
  chat_session_id: string;
  provider: ChatProvider;
  /** Provider-derived display title (null for legacy rows or sessions that haven't generated one yet). */
  title: string | null;
  first_message: string;  // First user message (truncated for display)
  message_count: number;
  created_at: string;      // Earliest message (session start)
  last_activity: string;   // Most recent message; matches the list's sort order
}

/** Chat session entity - stores Claude SDK session ID for resume functionality */
export interface ChatSession {
  id: string;  // Same as chat_session_id in chat_messages
  project_id: string;
  claude_session_id: string | null;  // Claude SDK session ID for resume
  provider: ChatProvider;
  provider_session_id: string | null; // Native provider thread/session ID for resume
  scope: ChatSessionScope;
  focus_document_path: string | null;
  focus_document_title: string | null;
  focus_document_hash: string | null;
  last_opened_at: string | null;
  title: string | null;
  /** Raw versioned Chat model-choice JSON; parsed only by the main model-choice module. */
  chat_model_choice?: string | null;
  chat_model_choice_revision?: number;
  created_at: string;
}

/**
 * A user-defined slash command, skill, or imported prompt template.
 * Claude commands/skills are expanded by the Agent SDK; pi prompt templates are
 * expanded by KPM before dispatch.
 */
export interface SlashCommandInfo {
  /** Command name without the leading slash. Subdirectory segments join with ':' (sub/foo.md → 'sub:foo'). */
  name: string;
  /** From frontmatter `description`, falling back to the first body line. */
  description: string;
  /** From frontmatter `argument-hint` (e.g. "<file>"). */
  argumentHint?: string;
  /** Optional origin label for imported command sources. */
  source?: 'pi-template';
}

// =============================================================================
// Permission System Types
// =============================================================================

/** Permission request sent from main to renderer. Display copy is composed from these structured fields. */
export interface PermissionRequest {
  requestId: string;
  projectId: string;
  toolName: string;
  targetPath: string | null;
  preview: string;
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
 * - pending → active (session approved, agent starting)
 * - active → inactive (agent exits for any reason)
 * - inactive → active (user resumes)
 * - (any) → deleted (user deletes session)
 */
export type DevSessionStatus =
  | 'pending'      // Awaiting user approval to start
  | 'active'       // Agent process is running
  | 'inactive';    // Stopped (can resume or delete)

/** Sessions that count as "currently running an agent". */
export const ACTIVE_SESSION_STATUSES: readonly DevSessionStatus[] = ['pending', 'active'];

/** Sessions whose detail pane can be opened (running or resumable). */
export const OPENABLE_SESSION_STATUSES: readonly DevSessionStatus[] = ['pending', 'active', 'inactive'];

export type DevSessionAutomationPhase =
  | 'idle'
  | 'reviewing'
  | 'addressing_review'
  | 'fixing_commit_hooks'
  | 'paused'
  | 'ready_for_review'
  | 'needs_attention';

export type DevSessionPausedReason = 'gate' | 'max_passes' | 'stalled';

export function isCommitHookRepairPhase(
  phase: DevSessionAutomationPhase | null | undefined,
): boolean {
  return phase === 'fixing_commit_hooks';
}

/**
 * Automation phases during which an agent is working (or the task needs the
 * user) even though the implementation session itself may be `inactive`. The
 * impl session is marked inactive the moment its agent exits, and auto-review
 * runs on a separate synthetic session — so the board uses this to keep a card
 * "live" (e.g. showing "Reviewing") across those phases instead of going blank.
 */
export function isLiveAutomationPhase(
  phase: DevSessionAutomationPhase | null | undefined,
): boolean {
  return (
    phase === 'reviewing'
    || phase === 'addressing_review'
    || phase === 'paused'
    || phase === 'needs_attention'
    || isCommitHookRepairPhase(phase)
  );
}

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
  // Immutable fork-point SHA captured when the worktree was created. Commit/diff
  // ranges use this so a task's "Changes" reflect only its own work, never
  // commits that landed on a moving base ref. Null for legacy/pre-capture rows.
  base_sha: string | null;

  // Status
  status: DevSessionStatus;

  // Agent type used for this session
  agent_type: AgentType;
  review_policy: AgentReviewPolicy;
  automation_phase: DevSessionAutomationPhase | null;
  playbook_id: string | null;
  playbook_snapshot: string | null;
  current_step_id: string | null;
  step_pass_counts: string | null;
  step_outputs?: string | null;
  paused_reason: DevSessionPausedReason | null;

  // Context passed to Claude Code
  initial_instructions: string;
  /** Work Brief revision captured by initial_instructions; null for legacy sessions. */
  work_brief_revision: number | null;

  // PR tracking
  pr_number: number | null;
  pr_url: string | null;
  pr_state: string | null;      // 'OPEN' | 'CLOSED' | 'MERGED'
  review_state: string | null;  // 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'

  // Merge ordering (null = derive from plan dependency graph; integer = user explicit override)
  merge_order: number | null;

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
  latest_agent_review?: PersistedAgentReview | null;
  /**
   * All distinct agents that have completed at least one review of this
   * session (including runs later superseded). Unlike
   * `latest_agent_review.reviewer_agent`, this is sticky across re-reviews —
   * use it to indicate "Codex has reviewed this at some point".
   */
  reviewer_agents_seen?: AgentType[];
  plan_item: {
    id: string;
    title: string;
    description: string | null;
    label: string | null;
    external_key: string | null;
    work_brief_revision: number;
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
  baseRefName?: string | null;
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
  updatedAt: string;
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
  last_pr_updated_at: string | null;
  probe_digest: string | null;
}


/** Counts of user-actionable review items for a session, broken down by reason. */
export interface ReviewActionableCounts {
  needsInput: number;
  failed: number;
  stale: number;
  errored: number;
}

/** Per-session actionable-review summary broadcast by the review poller. */
export interface ReviewActionableSummary {
  sessionId: string;
  hasActionable: boolean;
  counts: ReviewActionableCounts;
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
  /** AI-generated summary of the file's content */
  summary?: string;
  /** Whether this path is ignored by .gitignore */
  isIgnored?: boolean;
}

// =============================================================================
// Confluence Integration Types
// =============================================================================

/**
 * Link between an KPM document and a Confluence page.
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
export type PromptCategory = 'system' | 'generation' | 'agents';

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

/** User preference for enabling/disabling an MCP server in KPM */
export interface McpServerPreference {
  name: string;
  enabled: boolean;
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

export type ClaudeAvailability =
  | { status: 'bundled'; binaryPath: string }
  | { status: 'path-fallback'; binaryPath: string; reason: string }
  | { status: 'unreachable'; reason: string; searchedPaths: string[] };
