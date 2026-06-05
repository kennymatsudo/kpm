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

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  query,
  type Query,
  type Options as SDKOptions,
} from '@anthropic-ai/claude-agent-sdk';
import { isInitMessage, isSessionStateChanged } from '../../claude/sdkTypeGuards';
import { BaseAgentSession } from './BaseAgentSession';
import { getConfig } from '../../config';
import type {
  IAgentSession,
  AgentType,
  AgentSessionState,
  AgentSessionRole,
  AgentCompletionSummary,
} from '../../../shared/agent-types';

const execFileAsync = promisify(execFile);

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

  private _stopping = false;
  private queryInstance: Query | null = null;
  private sdkSessionId: string | null = null;
  private sdkOptions: SDKOptions;
  private abortController: AbortController | null = null;
  private completing = false;
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
    if (this._state !== 'starting') {
      throw new Error(`Cannot start session in state: ${this._state}`);
    }


    this.emitActivity({
      type: 'system',
      timestamp: Date.now(),
      summary: 'Starting Claude session...',
      status: 'running',
    });

    await this.waitForReady();

    }

  }

  followUp(text: string): Promise<void> {
    if (this._state !== 'complete' && this._state !== 'failed' && this._state !== 'stopped') {
    }

    }

    });

    this.setState('working');
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this._state === 'stopped') {
      return; // Already fully torn down
    }

    // `complete` / `failed` are terminal from the SDK's perspective but the
    this._stopping = true;

    this.abortController?.abort();

    try {
    } catch {
    }

    this.setState('stopped');
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


    try {
      for await (const msg of this.queryInstance) {
        this.processMessage(msg);
      }

      if (!this._stopping && (this._state === 'working' || this._state === 'starting')) {
        await this.handleCompletion();
      }
    } catch (error) {
    }
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
      this.sdkSessionId = msg.session_id;
    }

    if (msg.type === 'system' && msg.subtype === 'task_started') {
      this.markReady();
      return;
    }

    if (msg.type === 'system' && msg.subtype === 'task_updated') {
      this.markReady();
      const status = msg.patch?.status;
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

      const terminalReason = msg.terminal_reason;
      // Only stash non-normal reasons; 'completed' is the expected case and
      // surfacing it as "ended because completed" would be noise.
      if (typeof terminalReason === 'string' && terminalReason && terminalReason !== 'completed') {
        this.terminalReason = terminalReason;
      }
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

  private beginTurn(): void {
    this.lastProgressSummary = null;
    this.terminalReason = null;
  }

  private async handleCompletion(): Promise<void> {
    if (this.completing || this._state === 'complete') {
      return;
    }
    this.completing = true;
    const summary = await this.getCompletionSummary();
    this.setState('complete');
    this.emit('onComplete', summary);
    this.completing = false;
  }

  /** Parse git diff stats from the worktree to build completion summary */
  private async getCompletionSummary(): Promise<AgentCompletionSummary> {
    const terminalReason = this.terminalReason ?? undefined;
    const cwd = this.sdkOptions.cwd;
    if (!cwd) {
      return { filesChanged: 0, additions: 0, deletions: 0, terminalReason };
    }

    try {
      const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], { cwd });
      // Parse last line: " 4 files changed, 142 insertions(+), 38 deletions(-)"
      const match = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(stdout);
      if (match) {
        return {
          filesChanged: parseInt(match[1], 10) || 0,
          additions: parseInt(match[2], 10) || 0,
          deletions: parseInt(match[3], 10) || 0,
          terminalReason,
        };
      }
    } catch {
      // Git diff may fail if not a git repo or no changes
    }

    return { filesChanged: 0, additions: 0, deletions: 0, terminalReason };
  }

}
