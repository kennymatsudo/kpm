/**
 * @kpm/shared-types
 *
 * Core domain types shared between the main Electron app and standalone packages
 * (MCP server, tracker-clients). This package has NO dependencies to avoid
 * native module conflicts between Electron and system Node.js.
 */

// =============================================================================
// Status Types
// =============================================================================

export type StatusCategory = 'not_started' | 'in_progress' | 'in_review' | 'done' | 'blocked' | 'canceled';

export type TrackerType = 'jira' | 'linear';

// =============================================================================
// Core Domain Types
// =============================================================================

export interface Project {
  id: string;
  name: string;
  folder_path: string;
  phase: 'discovery' | 'high_level' | 'detailed' | 'ready';
  session_tokens?: number;
  session_input_tokens?: number;
  session_output_tokens?: number;
  storybook_url?: string | null;
  /** JSON-serialized Record<repoPath, string[]> of last-used feature directories */
  context_directories?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlanItem {
  id: string;
  project_id?: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  /** One-sentence "what this item commits to" — the decided outcome, distinct from the prose rationale in description. */
  intent: string | null;
  /** Structured agent contract: each entry is one testable criterion. Serialized as JSON in SQLite. */
  acceptance_criteria: string[] | null;
  /** Loose reference to the project document this item was extracted from. No FK — docs can be deleted without cascading. */
  source_document_id: string | null;
  label: string | null;
  item_order: number;
  code_refs: string[] | null;
  status: 'planned';
  release_tag: string | null;
  position_x: number | null;
  position_y: number | null;
  // Visual grouping (Figma-style frames)
  group_id: string | null;
  // External tracker fields
  association_id?: string | null;
  external_key: string | null;
  external_id: string | null;
  external_type: TrackerType | null;
  external_issue_type?: string | null;
  external_status: string | null;
  status_category: StatusCategory | null;
  external_url: string | null;
  external_parent_key?: string | null;
  external_epic_key?: string | null;
  sync_source?: 'local' | TrackerType;
  last_synced_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlanRelation {
  id: string;
  project_id: string;
  from_item_id: string;
  to_item_id: string;
  relation_type: 'depends_on' | 'blocks' | 'relates_to';
  created_at?: string;
}

export interface Worktree {
  id: string;
  plan_item_id: string;
  project_id: string;
  worktree_path: string;
  branch_name: string;
  created_at?: string;
  last_opened_at?: string;
}

// =============================================================================
// Worktree Service Types
// =============================================================================

export interface WorktreeStatus {
  worktree: Worktree;
  commitsAhead: number;
  hasUnpushedCommits: boolean;
  branchExists: boolean;
}

export interface LaunchResult {
  worktree: Worktree;
  isNew: boolean;
}

// =============================================================================
// Group Types - Visual containers for organizing plan items
// =============================================================================

export interface Group {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_collapsed: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Agent Types (re-exported from agent-types.ts)
// =============================================================================

export type { AgentType, AgentSessionState, AgentSessionRole } from './agent-types';
