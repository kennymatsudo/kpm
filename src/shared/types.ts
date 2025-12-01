// Shared types used across main, preload, and renderer processes

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
}
