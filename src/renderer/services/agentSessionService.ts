/**
 * Agent Session Service - Renderer-side wrapper for agent session IPC calls.
 *
 * Centralizes window.api.agentSessions access to comply with the
 * "no direct window.api outside services" lint rule.
 */

import type {
  AgentSessionState,
  AgentSessionRole,
  AgentType,
  AgentEffortLevel,
  AgentExecutionMode,
  AgentReviewPolicy,
  DevSession,
  RepoEnvironmentMode,
} from '../../shared/types';
import type { AgentActivity, AgentQuestion, AgentCompletionSummary, ReviewFinding } from '../../shared/agent-types';

// =============================================================================
// IPC Invoke Wrappers
// =============================================================================

/**
 * Create a pending session and start an agent in one call.
 * This is the primary entry point from the board UI (play button / drag-to-start).
 */
export function createAndStartAgentSession(
  planItemId: string,
  repoId: string,
  prompt: string,
  agentType?: AgentType,
  baseBranch?: string,
  contextPaths?: string[],
  effort?: AgentEffortLevel,
  environmentMode?: RepoEnvironmentMode,
  executionMode?: AgentExecutionMode,
  reviewPolicy?: AgentReviewPolicy,
): Promise<{ success: boolean; session?: DevSession; error?: string }> {
  return window.api.agentSessions.createAndStart(
    planItemId,
    repoId,
    prompt,
    agentType,
    baseBranch,
    contextPaths,
    effort,
    environmentMode,
    executionMode,
    reviewPolicy,
  );
}

/**
 * Start an agent session for an existing pending/inactive dev session.
 */
export function startAgentSession(
  devSessionId: string,
): Promise<{ success: boolean; session?: DevSession; error?: string }> {
  return window.api.agentSessions.startAgent(devSessionId);
}

export function respondToAgent(
  devSessionId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.respond(devSessionId, text);
}

export function followUpAgent(
  devSessionId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.followUp(devSessionId, text);
}

export function stopAgentSession(
  devSessionId: string,
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.stop(devSessionId);
}

/**
 * Generate a commit message for the session's changes using the configured instructions.
 */
export function generateCommitMessage(
  devSessionId: string,
  taskTitle: string,
  externalKey?: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
}

/**
 * Commit uncommitted changes in the session's worktree.
 */
export function commitAgentSession(
  devSessionId: string,
  message: string,
}

/**
 * Get structured commit log for the session (commits ahead of base branch).
 */
export function getAgentCommitLog(
  devSessionId: string,
): Promise<{ success: boolean; commits?: { sha: string; subject: string; authorName: string; date: string }[]; error?: string }> {
  return window.api.agentSessions.getCommitLog(devSessionId);
}

/**
 * Get file stats (additions/deletions per file) for a single commit.
 */
export function getAgentCommitFiles(
  devSessionId: string,
  sha: string,
): Promise<{ success: boolean; files?: { path: string; additions: number; deletions: number }[]; error?: string }> {
  return window.api.agentSessions.getCommitFiles(devSessionId, sha);
}

/**
 * Launch opposing-agent auto-review for a completed implementation session.
 */
export function launchAutoReview(
  devSessionId: string,
): Promise<{ success: boolean; reviewSessionId?: string | null; error?: string }> {
  return window.api.agentSessions.launchReview(devSessionId);
}

export function getAgentActivities(
  devSessionId: string,
): Promise<{ success: boolean; activities?: AgentActivity[]; error?: string }> {
  return window.api.agentSessions.getActivities(devSessionId);
}

export function getAgentState(
  devSessionId: string,
): Promise<{ success: boolean; state?: AgentSessionState | null; error?: string }> {
  return window.api.agentSessions.getState(devSessionId);
}

// =============================================================================
// IPC Event Subscriptions
// =============================================================================

export function subscribeToAgentStateChanges(
  callback: (event: { sessionId: string; devSessionId: string; state: AgentSessionState }) => void,
): () => void {
  return window.api.agentSessions.onStateChanged(callback);
}

export function subscribeToAgentActivities(
  callback: (event: { sessionId: string; devSessionId: string; activity: AgentActivity }) => void,
): () => void {
  return window.api.agentSessions.onActivity(callback);
}

export function subscribeToAgentQuestions(
  callback: (event: { sessionId: string; devSessionId: string; question: AgentQuestion }) => void,
): () => void {
  return window.api.agentSessions.onQuestion(callback);
}

export function subscribeToAgentComplete(
  callback: (event: { sessionId: string; devSessionId: string; role: AgentSessionRole; summary: AgentCompletionSummary; findings?: ReviewFinding[] }) => void,
): () => void {
  return window.api.agentSessions.onComplete(callback);
}

export function subscribeToAgentErrors(
  callback: (event: { sessionId: string; devSessionId: string; error: string }) => void,
): () => void {
  return window.api.agentSessions.onError(callback);
}
