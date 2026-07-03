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
export function createAndStartAgentSession(payload: {
  planItemId: string;
  repoId: string;
  prompt: string;
  agentType?: AgentType;
  baseBranch?: string;
  contextPaths?: string[];
  effort?: AgentEffortLevel;
  environmentMode?: RepoEnvironmentMode;
  executionMode?: AgentExecutionMode;
  reviewPolicy?: AgentReviewPolicy;
}): Promise<{ success: boolean; session?: DevSession; error?: string }> {
  return window.api.agentSessions.createAndStart(payload);
}

/**
 * Start an agent session for an existing pending/inactive dev session.
 */
export function startAgentSession(
  payload: { devSessionId: string; agentType?: AgentType; role?: AgentSessionRole },
): Promise<{ success: boolean; session?: DevSession; error?: string }> {
  return window.api.agentSessions.startAgent(payload);
}

export function respondToAgent(
  payload: { devSessionId: string; text: string },
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.respond(payload);
}

export function followUpAgent(
  payload: { devSessionId: string; text: string },
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.followUp(payload);
}

export function stopAgentSession(
  payload: { devSessionId: string },
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.stop(payload);
}

/**
 * Dismiss an "Automation interrupted" banner the user considers fine. Clears
 * the interrupted state back to idle without re-running the agent or committing.
 */
export function dismissAgentInterruption(
  payload: { devSessionId: string },
): Promise<{ success: boolean; error?: string }> {
  return window.api.agentSessions.dismissInterruption(payload);
}

/**
 * Generate a commit message for the session's changes using the configured instructions.
 */
export function generateCommitMessage(
  payload: { devSessionId: string; taskTitle: string; externalKey?: string },
): Promise<{ success: boolean; message?: string; error?: string }> {
  return window.api.agentSessions.generateCommitMessage(payload);
}

/**
 * Commit uncommitted changes in the session's worktree.
 */
export function commitAgentSession(
  payload: { devSessionId: string; message: string; repairOnFailure?: boolean },
): Promise<{ success: boolean; sha?: string; error?: string; repairStarted?: boolean }> {
  return window.api.agentSessions.commit(payload);
}

/**
 * Get structured commit log for the session (commits ahead of base branch).
 */
export function getAgentCommitLog(
  payload: { devSessionId: string },
): Promise<{ success: boolean; commits?: { sha: string; subject: string; authorName: string; date: string }[]; error?: string }> {
  return window.api.agentSessions.getCommitLog(payload);
}

/**
 * Get file stats (additions/deletions per file) for a single commit.
 */
export function getAgentCommitFiles(
  payload: { devSessionId: string; sha: string },
): Promise<{ success: boolean; files?: { path: string; additions: number; deletions: number }[]; error?: string }> {
  return window.api.agentSessions.getCommitFiles(payload);
}

/**
 * Launch opposing-agent auto-review for a completed implementation session.
 */
export function launchAutoReview(
  payload: { devSessionId: string },
): Promise<{ success: boolean; reviewSessionId?: string | null; error?: string }> {
  return window.api.agentSessions.launchReview(payload);
}

export function getAgentActivities(
  payload: { devSessionId: string },
): Promise<{ success: boolean; activities?: AgentActivity[]; error?: string }> {
  return window.api.agentSessions.getActivities(payload);
}

export function getAgentState(
  payload: { devSessionId: string },
): Promise<{ success: boolean; state?: AgentSessionState | null; error?: string }> {
  return window.api.agentSessions.getState(payload);
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
