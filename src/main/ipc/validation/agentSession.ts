/**
 * Agent Session Validation Schemas
 */

import { agentSessionEndpoints } from '../../../shared/ipc/agentSessionEndpoints';

export const AgentSessionSchemas = {
  /** Create a pending session + start agent in one call */
  createAndStart: agentSessionEndpoints.createAndStart.params,

  /** Start an agent session for an existing dev session */
  start: agentSessionEndpoints.startAgent.params,

  /** Respond to an agent's question */
  respond: agentSessionEndpoints.respond.params,

  /** Follow up after agent completion */
  followUp: agentSessionEndpoints.followUp.params,

  /** Stop an agent session */
  stop: agentSessionEndpoints.stop.params,

  /** Get activities for a session */
  getActivities: agentSessionEndpoints.getActivities.params,

  /** Get current state for a session */
  getState: agentSessionEndpoints.getState.params,

  /** Generate a commit message using the configured instructions */
  generateCommitMessage: agentSessionEndpoints.generateCommitMessage.params,

  /** Commit uncommitted changes in the session's worktree */
  commit: agentSessionEndpoints.commit.params,

  /** Get structured commit log for the session (commits ahead of base branch) */
  getCommitLog: agentSessionEndpoints.getCommitLog.params,

  /** Get file stats for a single commit */
  getCommitFiles: agentSessionEndpoints.getCommitFiles.params,

  /** Acknowledge an "Automation interrupted" banner without re-running or committing */
  dismissInterruption: agentSessionEndpoints.dismissInterruption.params,
};
