/**
 * Agent session domain endpoint registry (board-driven execution).
 *
 * One entry per `agent-session:*` IPC endpoint, keyed by the dotted method
 * path used on `window.api.agentSessions`. `agent-session:state-changed`,
 * `agent-session:activity`, `agent-session:question`, `agent-session:complete`,
 * and `agent-session:error` are events (`ipcRenderer.on`), not invoke
 * endpoints, so they stay hand-declared in `src/preload/api.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';


const agentType = z.enum(['claude', 'codex', 'gemini'], {
  message: 'Agent type must be "claude", "codex", or "gemini"',
});
const agentEffortLevel = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
const agentExecutionMode = z.enum(['standard', 'workflow']);
const agentReviewPolicy = z.enum(['auto', 'skip']);
const agentSessionRole = z.enum(['implement', 'review'], {
  message: 'Role must be "implement" or "review"',
});

export const agentSessionEndpoints = {
  createAndStart: {
    channel: 'agent-session:create-and-start',
    params: z.object({
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
  },
  startAgent: {
    channel: 'agent-session:start-agent',
    params: z.object({
      devSessionId: uuid,
      agentType: agentType.optional().default('claude'),
      role: agentSessionRole.optional().default('implement'),
    }),
  },
  respond: {
    channel: 'agent-session:respond',
    params: z.object({ devSessionId: uuid, text: z.string().min(1, 'Response text cannot be empty').max(100000) }),
  },
  followUp: {
    channel: 'agent-session:follow-up',
    params: z.object({ devSessionId: uuid, text: z.string().min(1, 'Follow-up text cannot be empty').max(100000) }),
  },
  stop: { channel: 'agent-session:stop', params: z.object({ devSessionId: uuid }) },
  getActivities: { channel: 'agent-session:get-activities', params: z.object({ devSessionId: uuid }) },
  getState: { channel: 'agent-session:get-state', params: z.object({ devSessionId: uuid }) },
  getAvailableAgents: { channel: 'agent-session:get-available-agents', params: null },
  launchReview: { channel: 'agent-session:launch-review', params: z.object({ devSessionId: uuid }) },
  generateCommitMessage: {
    channel: 'agent-session:generate-commit-message',
    params: z.object({
      devSessionId: uuid,
      taskTitle: z.string().min(1).max(1000),
      externalKey: z.string().optional(),
    }),
  },
  commit: {
    channel: 'agent-session:commit',
    params: z.object({
      devSessionId: uuid,
      message: z.string().min(1).max(10000),
      repairOnFailure: z.boolean().optional().default(false),
    }),
  },
  getCommitLog: { channel: 'agent-session:get-commit-log', params: z.object({ devSessionId: uuid }) },
  getCommitFiles: {
    channel: 'agent-session:get-commit-files',
    params: z.object({ devSessionId: uuid, sha: z.string().min(1).max(64) }),
  },
  dismissInterruption: {
    channel: 'agent-session:dismiss-interruption',
    params: z.object({ devSessionId: uuid }),
  },
} satisfies Record<string, EndpointDefinition>;

export type AgentSessionEndpoints = typeof agentSessionEndpoints;
export type AgentSessionEndpointName = keyof AgentSessionEndpoints;
