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
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { AgentActivity, AgentSessionState, AgentType } from '../agent-types';
import type { DevSession } from '../types';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/agentSessions.ts`): the handler returns bare data
 * (or `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

const agentType = z.enum(['claude', 'codex', 'gemini'], {
  message: 'Agent type must be "claude", "codex", or "gemini"',
});
const agentEffortLevel = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
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
      environmentMode: z.enum(['auto', 'direnv', 'nix', 'none']).optional(),
      reviewPolicy: agentReviewPolicy.optional().default('auto'),
      playbookId: z.string().min(1).max(200).optional(),
    }),
    result: resultOf<RegistryResponse<{ session: DevSession }>>(),
  },
  startAgent: {
    channel: 'agent-session:start-agent',
    params: z.object({
      devSessionId: uuid,
      agentType: agentType.optional().default('claude'),
      role: agentSessionRole.optional().default('implement'),
    }),
    result: resultOf<RegistryResponse<{ session: DevSession }>>(),
  },
  resumePlaybook: {
    channel: 'agent-session:resume-playbook',
    params: z.object({
      devSessionId: uuid,
      note: z.string().max(100000).optional(),
      action: z.enum(['resume', 'proceed', 'one_more_pass']).optional().default('resume'),
    }),
    result: resultOf<RegistryResponse<{ session: DevSession }>>(),
  },
  respond: {
    channel: 'agent-session:respond',
    params: z.object({ devSessionId: uuid, text: z.string().min(1, 'Response text cannot be empty').max(100000) }),
    result: resultOf<RegistryResponse>(),
  },
  followUp: {
    channel: 'agent-session:follow-up',
    params: z.object({ devSessionId: uuid, text: z.string().min(1, 'Follow-up text cannot be empty').max(100000) }),
    result: resultOf<RegistryResponse<{ restarted: boolean; deferred?: boolean }>>(),
  },
  stop: { channel: 'agent-session:stop', params: z.object({ devSessionId: uuid }), result: resultOf<RegistryResponse>() },
  getActivities: {
    channel: 'agent-session:get-activities',
    params: z.object({ devSessionId: uuid }),
    result: resultOf<RegistryResponse<{ activities: AgentActivity[] }>>(),
  },
  getState: {
    channel: 'agent-session:get-state',
    params: z.object({ devSessionId: uuid }),
    result: resultOf<RegistryResponse<{ state: AgentSessionState | null }>>(),
  },
  getAvailableAgents: {
    channel: 'agent-session:get-available-agents',
    params: null,
    result: resultOf<RegistryResponse<{ agents: AgentType[] }>>(),
  },
  launchReview: {
    channel: 'agent-session:launch-review',
    params: z.object({ devSessionId: uuid }),
    result: resultOf<RegistryResponse<{ reviewSessionId: string | null }>>(),
  },
  generateCommitMessage: {
    channel: 'agent-session:generate-commit-message',
    params: z.object({
      devSessionId: uuid,
      taskTitle: z.string().min(1).max(1000),
      externalKey: z.string().optional(),
    }),
    result: resultOf<RegistryResponse<{ message: string }>>(),
  },
  commit: {
    channel: 'agent-session:commit',
    params: z.object({
      devSessionId: uuid,
      message: z.string().min(1).max(10000),
      repairOnFailure: z.boolean().optional().default(false),
    }),
    // `commit`'s handler returns its own `{success: false, ...}` shape on
    // failure instead of throwing; `createRegistryIpcHandlers` spreads it
    // over `{success: true}`, so the wire result's `success` reflects the
    // handler's own value, not always `true`.
    result: resultOf<
      | ({ success: true } & { sha: string })
      | { success: false; error: string; repairStarted?: true }
    >(),
  },
  getCommitLog: {
    channel: 'agent-session:get-commit-log',
    params: z.object({ devSessionId: uuid }),
    result: resultOf<RegistryResponse<{ commits: { sha: string; subject: string; authorName: string; date: string }[] }>>(),
  },
  getCommitFiles: {
    channel: 'agent-session:get-commit-files',
    params: z.object({ devSessionId: uuid, sha: z.string().min(1).max(64) }),
    result: resultOf<RegistryResponse<{ files: { path: string; additions: number; deletions: number }[] }>>(),
  },
  dismissInterruption: {
    channel: 'agent-session:dismiss-interruption',
    params: z.object({ devSessionId: uuid }),
    result: resultOf<RegistryResponse>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type AgentSessionEndpoints = typeof agentSessionEndpoints;
export type AgentSessionEndpointName = keyof AgentSessionEndpoints;
