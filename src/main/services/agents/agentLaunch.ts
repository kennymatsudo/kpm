/**
 * The one translation from a resolved board agent (provider + model + effort)
 * to a registered agent session.
 *
 * `AgentSessionManager.create` takes the union of every provider's launch
 * options, so a caller assembling that object has to know which fields its
 * provider actually reads. Three call sites used to answer that question
 * separately and answered it differently — Claude subagents silently lost
 * their configured effort, and writing subagents ran with workflows enabled
 * and no repo environment. Every board launch goes through here instead.
 */

import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { getConfig } from '../../config';
import { getAgentEnv } from '../streaming/envUtils';
import { captureRepoEnvironment } from '../repo/EnvironmentService';
import {
  buildBoardProviderPrompt,
  buildBoardSdkSettings,
  resolveBoardEffort,
  type BoardClaudeModel,
} from '../repo/devSessionPrompt';
import type { AgentSessionManager } from './AgentSessionManager';
import type { AgentType, IAgentSession } from '../../../shared/agent-types';
import type { AgentEffortLevel, RepoEnvironmentMode } from '../../../shared/types';

const LOG_PREFIX = '[AgentLaunch]';

/** Providers board execution can run. */
const BOARD_PROVIDERS: readonly AgentType[] = ['claude', 'codex', 'gemini', 'pi'];

/**
 * Board agents are one-shot: never pause on the built-in option picker or goal
 * approval, and never let a workflow take over the run.
 */
const BOARD_DISALLOWED_TOOLS = ['AskUserQuestion', 'Workflow', 'ProposeGoal'];

/**
 * `implement` is the main run the user started; `subagent` is any playbook step
 * or opposing review launched on its behalf. The role decides turn budget and
 * the default Claude model, nothing else.
 */
export type BoardLaunchRole = 'implement' | 'subagent';

export interface BoardLaunchRequest {
  /** Agent session id: the dev session's own id, or a derived review/subagent id. */
  sessionId: string;
  projectId: string;
  provider: AgentType;
  role: BoardLaunchRole;
  worktreePath: string;
  /** Role instructions. Claude and pi take these natively; other providers get them prepended to the prompt. */
  systemPrompt: string;
  taskPrompt: string;
  model?: string;
  effort?: AgentEffortLevel;
  /** False puts the provider in its read-only mode. */
  writes: boolean;
  expectsFindings?: boolean;
  environmentMode?: RepoEnvironmentMode;
  /** Set for a subagent so its completion resolves back to the run that launched it. */
  relationship?: { implementationSessionId: string; stepId: string; runIndex: number };
}

export interface BoardAgentLaunch {
  session: IAgentSession;
  /** The prompt to start with: already carries the role instructions for providers without a native slot. */
  providerPrompt: string;
}

/**
 * Narrows a resolved playbook provider to one board execution can run.
 * Callers differ in how they report the refusal, so this returns the verdict
 * rather than choosing a failure shape.
 */
export function isBoardRunnableProvider(provider: string): provider is AgentType {
  return (BOARD_PROVIDERS as readonly string[]).includes(provider);
}

export function boardProviderRefusal(provider: string): string {
  return `Provider ${provider} is not enabled for board execution`;
}

function defaultModelFor(provider: AgentType, role: BoardLaunchRole, requested?: string): string | undefined {
  if (requested) return requested;
  if (provider === 'claude') {
    return role === 'implement' ? 'sonnet' : getConfig().generation.fastModel;
  }
  if (provider === 'codex') return getConfig().agentSession.codexModel;
  return undefined;
}

export async function createBoardAgentSession(
  request: BoardLaunchRequest,
  agentSessionManager: AgentSessionManager,
): Promise<BoardAgentLaunch> {
  const { provider, role, worktreePath, systemPrompt } = request;

  const environment = await captureRepoEnvironment(
    request.environmentMode ?? 'auto',
    worktreePath,
  );
  if (environment.direnvFailure) {
    console.warn(
      `${LOG_PREFIX} No direnv environment for ${request.sessionId}: ${environment.direnvFailure}. ` +
      `Run 'direnv allow' in ${worktreePath} if the repo's tooling needs it.`
    );
  }

  const model = defaultModelFor(provider, role, request.model);
  const effort = provider === 'claude'
    ? resolveBoardEffort((model ?? 'sonnet') as BoardClaudeModel, request.effort)
    : request.effort;

  const sdkOptions: SDKOptions | undefined = provider === 'claude'
    ? {
        systemPrompt,
        model,
        cwd: worktreePath,
        maxTurns: role === 'implement'
          ? getConfig().claude.maxTurns
          : getConfig().agentSession.subagentMaxTurns,
        permissionMode: getConfig().claude.defaultPermissionMode,
        disallowedTools: BOARD_DISALLOWED_TOOLS,
        settingSources: ['user'],
        settings: buildBoardSdkSettings(),
        env: { ...getAgentEnv(), ...environment.vars, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
        thinking: { type: 'adaptive' as const, display: 'summarized' as const },
        ...(role === 'implement' ? { agentProgressSummaries: true } : {}),
        ...(effort && { effort }),
        ...getClaudeSdkSpawnOptions(),
      }
    : undefined;

  const session = agentSessionManager.create({
    devSessionId: request.sessionId,
    projectId: request.projectId,
    agentType: provider,
    role: role === 'implement' ? 'implement' : 'review',
    sdkOptions,
    model: provider === 'codex' || provider === 'pi' ? model : undefined,
    systemPrompt: provider === 'pi' ? systemPrompt : undefined,
    effort: provider === 'codex' || provider === 'pi' ? effort : undefined,
    readOnly: !request.writes,
    expectsFindings: request.expectsFindings,
    implementationSessionId: request.relationship?.implementationSessionId,
    stepId: request.relationship?.stepId,
    runIndex: request.relationship?.runIndex,
  });

  return {
    session,
    providerPrompt: buildBoardProviderPrompt(provider, systemPrompt, request.taskPrompt),
  };
}
