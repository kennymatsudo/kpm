/**
 * Types for Claude prompt context.
 */

import type { Project, Repo, Attachment, PlanItem, FocusedResource, TaskPromptTemplate, FocusChatDocument } from '../../../shared/types';

export interface PlanContext {
  project: Project;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  focusedResources: FocusedResource[];
  /** Custom task prompt template - if set, overrides default PLAN_STRUCTURE */
  taskPromptTemplate?: TaskPromptTemplate | null;
  /** Project context file content (AGENTS.md or CLAUDE.md), if it exists */
  contextFileContent?: string | null;
  /** Focus-reader document context for slim focused chat sessions */
  focusDocument?: FocusChatDocument;
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
