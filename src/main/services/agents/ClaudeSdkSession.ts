/**
 * ClaudeSdkSession - Agent SDK implementation of the AgentSession interface.
 *
 * Wraps the StreamingSession pattern scoped to a worktree directory.
 * Each dev session gets its own independent SDK session with:
 * - System prompt built from plan item context
 * - Working directory set to the worktree path
 * - Subset of MCP tools (file ops, bash, search — no plan modification)
 * - Structured activity events mapped from SDK messages
 */

import {
  query,
  type Query,
  type Options as SDKOptions,
} from '@anthropic-ai/claude-agent-sdk';
import { isInitMessage, isSessionStateChanged } from '../../claude/sdkTypeGuards';
import { BaseAgentSession } from './BaseAgentSession';
import { createCredentialGuardMatcher } from './credentialGuardHook';
import { getConfig } from '../../config';
import type {
  IAgentSession,
  AgentType,
  AgentSessionState,
  AgentSessionRole,
  AgentCompletionSummary,
} from '../../../shared/agent-types';

// =============================================================================
// SDK Message Helpers
// =============================================================================

/** Extract a human-readable activity summary from a tool_use block */
function summarizeToolUse(toolName: string, input: Record<string, unknown>): string {
  // Normalize MCP-prefixed tool names: mcp__kpm__read_file → read_file
  const shortName = toolName.replace(/^mcp__\w+__/, '');

  switch (shortName) {
    case 'read_file':
    case 'Read':
      return `Read ${(input.file_path as string) || (input.path as string) || 'file'}`;
    case 'edit_file':
    case 'Edit':
      return `Edit ${(input.file_path as string) || (input.path as string) || 'file'}`;
    case 'write_file':
    case 'Write':
      return `Write ${(input.file_path as string) || (input.path as string) || 'file'}`;
    case 'bash':
    case 'Bash': {
      const cmd = (input.command as string) || '';
      const short = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
      return `Run ${short}`;
    }
    case 'grep':
    case 'Grep':
      return `Search for "${(input.pattern as string) || ''}"`;
    case 'glob':
    case 'Glob':
      return `Find files matching ${(input.pattern as string) || ''}`;
    case 'list_directory':
      return `List ${(input.path as string) || 'directory'}`;
    default:
      return shortName;
  }
}

// =============================================================================
// ClaudeSdkSession
// =============================================================================

export interface ClaudeSdkSessionConfig {
  /** Unique session ID (maps to dev session ID or generated) */
  id: string;
  /** Role: implement or review */
  role: AgentSessionRole;
  /** SDK options to pass to query() */
  sdkOptions: SDKOptions;
}

export class ClaudeSdkSession extends BaseAgentSession implements IAgentSession {
  readonly agentType: AgentType = 'claude';

  private queryInstance: Query | null = null;
  private sdkSessionId: string | null = null;
  private sdkOptions: SDKOptions;
  private workflowTaskIds = new Set<string>();
  private workflowTaskLabels = new Map<string, string>();
  private lastProgressSummary: string | null = null;
  private terminalReason: string | null = null;

  constructor(config: ClaudeSdkSessionConfig) {
    super(config.id, config.role);
    this.sdkOptions = config.sdkOptions;
  }

  // ===========================================================================
  // Public Interface
  // ===========================================================================

  async start(worktreePath: string, prompt: string): Promise<void> {
    this.assertStarting();

    // Pin the worktree as the working directory for every turn on this session.
    this.sdkOptions = { ...this.sdkOptions, cwd: worktreePath };

    this.emitStartingActivity('Starting Claude session...');

    // Kick off the first turn. It runs to completion on its own; we only wait
    // here for the session to become ready (init / first message) so the caller
    // can surface launch failures.
    this.runPromise = this.runTurn(prompt);
    await this.waitForReady();

    // `waitForReady` resolves on working/complete/failed — `markReady` already
    // performed the starting→working transition. Only nudge here if a turn
    // somehow resolved readiness without leaving `starting`; never clobber a
    // terminal state reached by an ultra-fast turn.
    if (this._state === 'starting') {
      this.setState('working');
    }
  }

  respond(): Promise<void> {
    // Board Claude sessions run with bypassPermissions and AskUserQuestion
    // disallowed — they never pause for interactive input mid-turn.
    return Promise.reject(new Error('Board Claude sessions do not ask follow-up questions'));
  }

  followUp(text: string): Promise<void> {
    const followUpError = this.checkFollowUpAllowed();
    if (followUpError) {
      return Promise.reject(followUpError);
    }

    if (!this.sdkSessionId) {
      // Without a resumable session id we can't continue in-place; let the
      // caller (DevSessionService.sendAgentFollowUp) fall back to a restart.
      return Promise.reject(new Error('No SDK session to resume — session may have been cleaned up'));
    }

    this.beginTurn('Continuing Claude session...');
    this.runPromise = this.runTurn(text);
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    // `complete` / `failed` are terminal from the SDK's perspective but the
    // subprocess can still be alive (the SDK keeps the worker warm for
    // follow-ups). User-initiated stop must release those resources regardless
    // of state, so only `stopped` itself counts as already torn down.
    await this.stopSession(
      () => this.abortController?.abort(),
      () => this._state === 'stopped',
    );
  }

  /** The most recent non-empty assistant text, used to extract review findings. */
  protected finalOutput(): string | null {
    const latestMessage = [...this._activities]
      .reverse()
      .find((activity) => activity.type === 'message' && typeof activity.content === 'string' && activity.content.trim().length > 0);
    return latestMessage?.content ?? null;
  }

  // ===========================================================================
  // Internal: SDK Communication
  // ===========================================================================

  private async waitForReady(): Promise<void> {
    // The SDK sends an init message when MCP is connected.
    // We wait for the first `working` state or for the timeout.
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutMs = getConfig().agentSession.sessionStartTimeoutMs;
      const listenerRef: { current?: (state: AgentSessionState) => void } = {};
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (listenerRef.current) {
          this.off('onStateChange', listenerRef.current);
        }
        this.abortController?.abort();
        this.setState('failed');
        reject(new Error(`Agent session start timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      const onState = (state: AgentSessionState) => {
        if (settled) return;
        if (state === 'working' || state === 'complete' || state === 'failed') {
          settled = true;
          clearTimeout(timeoutId);
          this.off('onStateChange', onState);
          if (state === 'failed') {
            reject(new Error('Agent session failed during startup'));
          } else {
            resolve();
          }
        }
      };

      listenerRef.current = onState;
      this.on('onStateChange', onState);
    });
  }

  /**
   * Run a single turn to completion. Each board turn is a discrete single-shot
   * `query()`: the SDK ends the async iterator when the turn is fully done
   * (after the final `result`), which is the authoritative completion signal —
   * no debounce, no task-counting. Follow-up turns resume the prior session.
   */
  private async runTurn(prompt: string): Promise<void> {
    this.resetTurnTracking();

    await this.runGuardedTurn(
      async () => {
        this.queryInstance = query({
          prompt,
          options: {
            ...this.sdkOptions,
            abortController: this.abortController!,
            // Board sessions run under bypassPermissions, which skips canUseTool.
            // A PreToolUse hook still runs and can deny — the only non-interactive
            // way to block credential reads / git-hook writes on a board run.
            hooks: {
              ...this.sdkOptions.hooks,
              PreToolUse: [
                ...(this.sdkOptions.hooks?.PreToolUse ?? []),
                createCredentialGuardMatcher(),
              ],
            },
            // Resume preserves the prior conversation on follow-up turns. NOTE: the
            // SDK applies THESE options' systemPrompt on resume (not the persisted
            // one), so we must pass the full stored sdkOptions here.
            ...(this.sdkSessionId ? { resume: this.sdkSessionId } : {}),
          },
        });

        try {
          for await (const msg of this.queryInstance) {
            this.processMessage(msg);
          }

          // Iterator ended = turn complete (unless stop() aborted it). Checked
          // against both 'working' and 'starting' — an ultra-fast turn can end
          // before `markReady` ever promotes the session out of 'starting'.
          if (!this.stopping && (this._state === 'working' || this._state === 'starting')) {
            await this.completeOnce(() => this.getCompletionSummary());
          }
        } finally {
          this.queryInstance = null;
        }
      },
      (error) => {
        console.error('[ClaudeSdkSession] Turn loop error:', error);
        return { message: error instanceof Error ? error.message : String(error) };
      },
    );
  }

  // ===========================================================================
  // Internal: Message Processing
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processMessage(msg: any): void {
    // Init message — MCP connected
    if (isInitMessage(msg)) {
      this.sdkSessionId = msg.session_id;
      this.markReady();
      return;
    }

    if (isSessionStateChanged(msg)) {
      // Capture the session id (needed to resume on follow-up turns) and mark
      // ready. Turn completion is driven by the iterator ending, not by `idle`.
      this.sdkSessionId = msg.session_id;
      this.markReady();
      return;
    }

    if (msg.type === 'system' && msg.subtype === 'task_started') {
      this.markReady();
      this.trackWorkflowTaskStart(msg);
      return;
    }

    if (msg.type === 'system' && msg.subtype === 'task_updated') {
      this.markReady();
      const status = msg.patch?.status;
      if (status === 'completed' || status === 'failed' || status === 'killed') {
        this.trackWorkflowTaskEnd(msg.task_id, status);
      }
      return;
    }

    if (msg.type === 'system' && msg.subtype === 'task_progress') {
      this.markReady();
      // `summary` is populated by the SDK when `agentProgressSummaries` is on.
      // Emit it as a system activity so the UI can surface subagent progress
      // (e.g. "Analyzing authentication module"). Dedupe on the exact text
      // because the SDK repeats the last summary across progress ticks.
      const progressSummary = typeof msg.summary === 'string' ? msg.summary.trim() : '';
      if (progressSummary && progressSummary !== this.lastProgressSummary) {
        this.lastProgressSummary = progressSummary;
        this.emitActivity({
          type: 'system',
          timestamp: Date.now(),
          summary: progressSummary,
        });
      }
      return;
    }

    if (msg.type === 'system' && msg.subtype === 'task_notification') {
      this.markReady();
      if (msg.status === 'completed' || msg.status === 'failed' || msg.status === 'stopped') {
        this.trackWorkflowTaskEnd(msg.task_id, msg.status === 'stopped' ? 'killed' : msg.status);
      }
      return;
    }

    // Assistant messages (text, tool_use, thinking)
    if (msg.type === 'assistant') {
      this.markReady();
      const content = msg.message?.content || [];
      for (const block of content) {
        if (block.type === 'tool_use') {
          const summary = summarizeToolUse(block.name, block.input as Record<string, unknown>);
          this.emitActivity({
            type: 'tool_use',
            timestamp: Date.now(),
            toolName: block.name,
            toolInput: this.extractToolInput(block.name, block.input as Record<string, unknown>),
            summary,
            status: 'running',
          });
        }

        if (block.type === 'thinking' && block.thinking) {
          this.emitActivity({
            type: 'thinking',
            timestamp: Date.now(),
            summary: 'Thinking...',
            content: block.thinking,
          });
        }

        if (block.type === 'text' && block.text) {
          this.emitActivity({
            type: 'message',
            timestamp: Date.now(),
            summary: block.text.slice(0, 100) + (block.text.length > 100 ? '...' : ''),
            content: block.text,
          });
        }
      }
    }

    // Tool results
    if (msg.type === 'tool_result') {
      this.markReady();
      const isError = msg.is_error === true;
      // Find the most recent running tool_use and update its status
      for (let i = this._activities.length - 1; i >= 0; i--) {
        const act = this._activities[i];
        if (act.type === 'tool_use' && act.status === 'running') {
          act.status = isError ? 'failed' : 'success';
          // Emit as update — the activity reference is already in the array
          this.emit('onActivity', act);
          break;
        }
      }
    }

    // Result message — turn complete
    if (msg.type === 'result') {
      this.markReady();

      // Surface billable token usage so the manager can record it through
      // the centralized usage service. Defensive: a result without usage
      // (early aborts, structured-output retries) just emits zeros and
      // the service drops it.
      if (msg.usage) {
        const usage = msg.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
        const resultMsg = msg as { total_cost_usd?: number | null; session_id?: string | null; uuid?: string | null };
        const totalCostUsd = resultMsg.total_cost_usd;
        const modelOption = this.sdkOptions.model;
        this.emit('onUsage', {
          model: typeof modelOption === 'string' ? modelOption : null,
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          totalCostUsd: typeof totalCostUsd === 'number' ? totalCostUsd : null,
          sdkSessionId: resultMsg.session_id ?? this.id,
          sdkResultUuid: resultMsg.uuid ?? null,
          sdkCostScope: '__total__',
          isCumulativeCostSnapshot: true,
        });
      }

      // Record the terminal reason for the completion summary. Completion
      // itself fires when the iterator ends (see runTurn), so the `result`
      // message only needs to capture metadata, not schedule anything. This
      // also handles structured-output retries gracefully: intermediate
      // results are just messages; the iterator still ends exactly once.
      const terminalReason = msg.terminal_reason;
      // Only stash non-normal reasons; 'completed' is the expected case and
      // surfacing it as "ended because completed" would be noise.
      if (typeof terminalReason === 'string' && terminalReason && terminalReason !== 'completed') {
        this.terminalReason = terminalReason;
      }
      if (terminalReason === 'max_turns') {
        this.emitActivity({
          type: 'system',
          timestamp: Date.now(),
          summary: `Turn limit reached (${msg.num_turns ?? 'unknown'} turns)`,
        });
      }
    }
  }

  /** Extract the primary input value for display */
  private extractToolInput(toolName: string, input: Record<string, unknown>): string {
    return (input.file_path as string)
      || (input.path as string)
      || (input.command as string)
      || (input.pattern as string)
      || '';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trackWorkflowTaskStart(msg: any): void {
    const taskId = typeof msg.task_id === 'string' ? msg.task_id : '';
    if (!taskId) {
      return;
    }

    const taskType = typeof msg.task_type === 'string' ? msg.task_type : '';
    const workflowName = typeof msg.workflow_name === 'string' ? msg.workflow_name.trim() : '';
    if (taskType !== 'local_workflow' && !workflowName) {
      return;
    }

    const description = typeof msg.description === 'string' ? msg.description.trim() : '';
    const label = workflowName || description || 'workflow';
    this.workflowTaskIds.add(taskId);
    this.workflowTaskLabels.set(taskId, label);
    this.emitActivity({
      type: 'system',
      timestamp: Date.now(),
      summary: `Workflow started: ${label}`,
      status: 'running',
    });
  }

  private trackWorkflowTaskEnd(taskId: string, status: 'completed' | 'failed' | 'killed'): void {
    if (!this.workflowTaskIds.has(taskId)) {
      return;
    }

    const label = this.workflowTaskLabels.get(taskId) ?? 'workflow';
    this.workflowTaskIds.delete(taskId);
    this.workflowTaskLabels.delete(taskId);
    const statusLabel = status === 'completed'
      ? 'completed'
      : status === 'failed'
        ? 'failed'
        : 'stopped';
    this.emitActivity({
      type: 'system',
      timestamp: Date.now(),
      summary: `Workflow ${statusLabel}: ${label}`,
      status: status === 'completed' ? 'success' : 'failed',
    });
  }

  // ===========================================================================
  // Internal: State & Events
  // ===========================================================================

  /**
   * The session is "ready" once the SDK begins emitting messages for the turn.
   * This avoids a circular startup wait where KPM waited for `working` before
   * ever marking the session as `working`.
   */
  private markReady(): void {
    if (this._state === 'starting') {
      this.setState('working');
    }
  }

  private resetTurnTracking(): void {
    this.workflowTaskIds.clear();
    this.workflowTaskLabels.clear();
    this.lastProgressSummary = null;
    this.terminalReason = null;
  }

  /** Parse git diff stats from the worktree to build completion summary */
  private async getCompletionSummary(): Promise<AgentCompletionSummary> {
    const terminalReason = this.terminalReason ?? undefined;
    const summary = await this.computeGitDiffSummary(this.sdkOptions.cwd);
    return { ...summary, terminalReason };
  }

}
