/**
 * CliAgentSession - PTY + hooks implementation for CLI agents (Claude Code, Gemini).
 *
 * Spawns the CLI agent binary in a worktree via node-pty (hidden, no xterm.js).
 * Hooks are configured to POST events to the KPM hook server, which are then
 * mapped to AgentActivity events.
 */

import * as pty from 'node-pty';
import { getAgentBinary } from './agentCatalog';
import { generateClaudeCodeHookSettings, cleanupClaudeCodeHookSettings } from './hooks/claudeCodeHooks';
import { hookEventToActivity, type HookEvent } from './hookServer';
import { getCleanEnv } from '../streaming/envUtils';
import { BaseAgentSession } from './BaseAgentSession';
import type {
  IAgentSession,
  AgentType,
  AgentSessionRole,
  AgentQuestion,
  AgentCompletionSummary,
} from '../../../shared/agent-types';

const LOG_PREFIX = '[CliAgentSession]';

/** Max output buffer per session (1MB) */
const MAX_OUTPUT_BUFFER = 1024 * 1024;

type CliAgentType = Exclude<AgentType, 'codex'>;

export interface CliAgentSessionConfig {
  id: string;
  agentType: CliAgentType;
  role: AgentSessionRole;
  /** Hook server port for configuring agent hooks */
  hookPort: number;
  expectsFindings?: boolean;
}

export class CliAgentSession extends BaseAgentSession implements IAgentSession {
  readonly agentType: CliAgentType;

  private ptyProcess: pty.IPty | null = null;
  private worktreePath: string | null = null;
  private outputBuffer = '';
  private lastAssistantMessage = '';
  private hookPort: number;

  constructor(config: CliAgentSessionConfig) {
    super(config.id, config.role, config.expectsFindings);
    this.agentType = config.agentType;
    this.hookPort = config.hookPort;
  }

  async start(worktreePath: string, prompt: string): Promise<void> {
    this.assertStarting();

    this.worktreePath = worktreePath;

    const binary = await getAgentBinary(this.agentType);
    if (!binary) {
      this.setState('failed');
      this.emit('onError', `${this.agentType} is not installed`);
      throw new Error(`${this.agentType} CLI is not installed`);
    }

    this.emitStartingActivity(`Starting ${this.agentType}...`);

    // Build args based on agent type
    const { args, env } = this.buildLaunchConfig(prompt);

    console.log(`${LOG_PREFIX} Spawning: ${binary} ${args.join(' ')} in ${worktreePath}`);

    this.ptyProcess = pty.spawn(binary, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: worktreePath,
      env: { ...getCleanEnv(), ...env, KPM_HOOK_PORT: String(this.hookPort) },
    });

    // Buffer output (not rendered — available for debugging)
    this.ptyProcess.onData((data) => {
      this.outputBuffer += data;
      if (this.outputBuffer.length > MAX_OUTPUT_BUFFER) {
        this.outputBuffer = this.outputBuffer.slice(-MAX_OUTPUT_BUFFER);
      }
    });

    // Handle exit
    this.ptyProcess.onExit(({ exitCode }) => {
      console.log(`${LOG_PREFIX} PTY exited with code ${exitCode} for session ${this.id}`);
      this.ptyProcess = null;
      this.cleanupHooks();

      // Checked against both 'working' and 'starting' — the PTY can exit
      // before this method's own starting->working transition below runs.
      if (this._state === 'working' || this._state === 'starting') {
        if (exitCode === 0) {
          void this.handleCompletion();
        } else {
          this.failTurn(new Error(`Agent exited with code ${exitCode}`), (error) => ({
            message: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    });

    if (this._state === 'starting') {
      this.setState('working');
    }
  }

  /**
   * Capability hook consumed by `AgentSessionManager.handleHookEvent` — hooks
   * are a CLI-only concept, so this is the seam the manager dispatches
   * through instead of checking `instanceof CliAgentSession`.
   */
  acceptHookEvent(event: unknown): boolean {
    this.handleHookEvent(event as HookEvent);
    return true;
  }

  /**
   * Called by the hook server (via `acceptHookEvent`) when this session
   * receives a hook event.
   */
  private handleHookEvent(hookEvent: HookEvent): void {
    // Map stop event to completion
    if (hookEvent.event === 'stop') {
      void this.maybeCompleteTurn(() => this.getCompletionSummary());
      return;
    }

    // Map permission request to question
    if (hookEvent.event === 'permission_request') {
      const question: AgentQuestion = {
        id: `q-${Date.now()}`,
        text: hookEvent.summary || 'Agent needs permission',
        timestamp: Date.now(),
      };
      this.setState('waiting_for_input');
      this.emit('onQuestion', question);
      return;
    }

    // Map error
    if (hookEvent.event === 'error') {
      this.emitActivity({
        type: 'error',
        timestamp: Date.now(),
        summary: hookEvent.error || 'Unknown error',
      });
      return;
    }

    // Map tool events to activity
    const activity = hookEventToActivity(hookEvent);
    if (activity) {
      // For post_tool_use, update the last running tool_use's status
      if (hookEvent.event === 'post_tool_use') {
        for (let i = this._activities.length - 1; i >= 0; i--) {
          const act = this._activities[i];
          if (act.type === 'tool_use' && act.status === 'running' && act.toolName === hookEvent.toolName) {
            act.status = hookEvent.error ? 'failed' : 'success';
            this.emit('onActivity', act);
            return;
          }
        }
      }
      this.emitActivity(activity);
    }
  }

  respond(text: string): Promise<void> {
    if (this._state !== 'waiting_for_input') {
      return Promise.reject(new Error(`Cannot respond in state: ${this._state}`));
    }
    if (!this.ptyProcess) {
      return Promise.reject(new Error('No active PTY process'));
    }

    // Write response to PTY stdin
    this.ptyProcess.write(text + '\n');
    this.setState('working');
    return Promise.resolve();
  }

  followUp(text: string): Promise<void> {
    const followUpError = this.checkFollowUpAllowed();
    if (followUpError) {
      return Promise.reject(followUpError);
    }
    if (!this.ptyProcess) {
      return Promise.reject(new Error('No active PTY process — session has ended'));
    }

    this.ptyProcess.write(text + '\n');
    this.setState('working');
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    await this.stopSession(() => {
      if (this.ptyProcess) {
        try {
          this.ptyProcess.kill();
        } catch {
          // Process may already be dead
        }
        this.ptyProcess = null;
      }

      this.cleanupHooks();
    });
  }

  /** Get the raw PTY output buffer (for debugging) */
  getOutput(): string {
    return this.lastAssistantMessage || this.outputBuffer;
  }

  protected finalOutput(): string | null {
    return this.getOutput() || null;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private buildLaunchConfig(prompt: string): { args: string[]; env: Record<string, string> } {
    const env: Record<string, string> = {};
    let args: string[] = [];

    switch (this.agentType) {
      case 'claude': {
        // Claude Code CLI with hooks
        const settingsPath = generateClaudeCodeHookSettings(this.id, this.hookPort);
        args = [
          '--print',
          '--settings', settingsPath,
          '--permission-mode', 'bypassPermissions',
          prompt,
        ];
        break;
      }
      case 'gemini': {
        // Gemini CLI — pass prompt as argument
        args = [prompt];
        break;
      }
    }

    return { args, env };
  }

  private cleanupHooks(): void {
    if (this.agentType === 'claude') {
      cleanupClaudeCodeHookSettings(this.id);
    }
  }

  private async handleCompletion(): Promise<void> {
    await this.completeOnce(() => this.getCompletionSummary());
  }

  private async getCompletionSummary(): Promise<AgentCompletionSummary> {
    return this.computeGitDiffSummary(this.worktreePath ?? undefined);
  }

}
