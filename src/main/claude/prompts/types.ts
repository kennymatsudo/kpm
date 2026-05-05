/**
 * Types for Claude prompt context.
 */


export interface PlanContext {
  project: Project;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  focusedResources: FocusedResource[];
  /** Current UI view - used for context-aware suggestions */
  currentView?: ChatViewMode;
  /** Custom task prompt template - if set, overrides default PLAN_STRUCTURE */
  taskPromptTemplate?: TaskPromptTemplate | null;
  /** Project context file content (AGENTS.md or CLAUDE.md), if it exists */
  claudeMdContent?: string | null;
  /** Prompt content resolver for configurable prompts (user override > default) */
  getPromptContent?: (key: string) => string;
  /**
   * Replay of earlier turns in this chat, injected when the previous SDK
   * session was discarded (e.g. after a worktree switch) but the KPM-side
   * conversation should continue. Empty/undefined for normal sends.
   */
  continuationHistory?: ContinuationTurn[];
}

export interface ContinuationTurn {
  role: 'user' | 'assistant';
  content: string;
}
