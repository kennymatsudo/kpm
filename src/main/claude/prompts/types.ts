/**
 * Types for Claude prompt context.
 */

import type { Project, Repo, Attachment, PlanItem, FocusedResource, ChatViewMode, TaskPromptTemplate, FocusChatDocument } from '../../../shared/types';
import type { ChatApprovalMode } from '../../../shared/appSettings';

export interface PlanContext {
  project: Project;
  repos: Repo[];
  attachments: Attachment[];
  planItems: PlanItem[];
  focusedResources: FocusedResource[];
  /** Current UI view - used for context-aware suggestions */
  currentView?: ChatViewMode;
  /** Whether Claude-proposed changes require review or apply immediately */
  approvalMode?: ChatApprovalMode;
  /** Custom task prompt template - if set, overrides default PLAN_STRUCTURE */
  taskPromptTemplate?: TaskPromptTemplate | null;
  /** Project context file content (AGENTS.md or CLAUDE.md), if it exists */
  claudeMdContent?: string | null;
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
