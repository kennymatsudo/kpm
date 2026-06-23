/**
 * Agent Session Validation Schemas
 */

import { z } from 'zod';
import { uuid } from './shared';

const agentType = z.enum(['claude', 'codex', 'gemini'], {
  message: 'Agent type must be "claude", "codex", or "gemini"',
});

const agentEffortLevel = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
const agentExecutionMode = z.enum(['standard', 'workflow']);
const agentReviewPolicy = z.enum(['auto', 'skip']);

const agentSessionRole = z.enum(['implement', 'review'], {
  message: 'Role must be "implement" or "review"',
});

export const AgentSessionSchemas = {
  /** Create a pending session + start agent in one call */
  createAndStart: z.object({
    planItemId: uuid,
    repoId: uuid,
    prompt: z.string().min(1, 'Prompt cannot be empty').max(100000),
    agentType: agentType.optional().default('claude'),
    baseBranch: z.string().min(1).optional(),
    contextPaths: z.array(z.string().min(1)).optional(),
    effort: agentEffortLevel.optional(),
    environmentMode: z.enum(['auto', 'direnv', 'none']).optional(),
    executionMode: agentExecutionMode.optional().default('standard'),
    reviewPolicy: agentReviewPolicy.optional().default('auto'),
  }),

  /** Start an agent session for an existing dev session */
  start: z.object({
    devSessionId: uuid,
    agentType: agentType.optional().default('claude'),
    role: agentSessionRole.optional().default('implement'),
  }),

  /** Respond to an agent's question */
  respond: z.object({
    devSessionId: uuid,
    text: z.string().min(1, 'Response text cannot be empty').max(100000),
  }),

  /** Follow up after agent completion */
  followUp: z.object({
    devSessionId: uuid,
    text: z.string().min(1, 'Follow-up text cannot be empty').max(100000),
  }),

  /** Stop an agent session */
  stop: z.object({
    devSessionId: uuid,
  }),

  /** Get activities for a session */
  getActivities: z.object({
    devSessionId: uuid,
  }),

  /** Get current state for a session */
  getState: z.object({
    devSessionId: uuid,
  }),

  /** Generate a commit message using the configured instructions */
  generateCommitMessage: z.object({
    devSessionId: uuid,
    taskTitle: z.string().min(1).max(1000),
    externalKey: z.string().optional(),
  }),

  /** Commit uncommitted changes in the session's worktree */
  commit: z.object({
    devSessionId: uuid,
    message: z.string().min(1).max(10000),
    repairOnFailure: z.boolean().optional().default(false),
  }),

  /** Get structured commit log for the session (commits ahead of base branch) */
  getCommitLog: z.object({
    devSessionId: uuid,
  }),

  /** Get file stats for a single commit */
  getCommitFiles: z.object({
    devSessionId: uuid,
    sha: z.string().min(1).max(64),
  }),

  /** Acknowledge an "Automation interrupted" banner without re-running or committing */
  dismissInterruption: z.object({
    devSessionId: uuid,
  }),
};
