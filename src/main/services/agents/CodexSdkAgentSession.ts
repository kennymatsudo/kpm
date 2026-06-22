/**
 * CodexSdkAgentSession - @openai/codex-sdk-backed board agent session.
 *
 * Implementation sessions run in the task worktree with workspace-write
 * sandboxing. Review sessions run read-only with structured findings output.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  Codex,
  type CommandExecutionItem,
  type FileChangeItem,
  type McpToolCallItem,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
  type TurnOptions,
} from '@openai/codex-sdk';
import { BaseAgentSession } from './BaseAgentSession';
import { findCodexBinaryPath } from '../../codex/binary';
import { classifyCodexError } from '../../codex/errors';
import { REVIEW_FINDINGS_SCHEMA } from './autoReview';
import type {
  AgentCompletionSummary,
  AgentSessionRole,
  AgentType,
  IAgentSession,
} from '../../../shared/agent-types';

const execFileAsync = promisify(execFile);

function truncate(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? normalized.slice(0, max - 3) + '...' : normalized;
}

function summarizeCommand(command: string): string {
  return `Run ${truncate(command || 'command')}`;
}

function summarizeMcpToolCall(item: McpToolCallItem): string {
  return `Tool ${item.server}.${item.tool}`;
}

function itemErrorMessage(item: ThreadItem): string | null {
  if (item.type === 'error') {
    return item.message;
  }
  if (item.type === 'mcp_tool_call' && item.error?.message) {
    return item.error.message;
  }
  return null;
}

export interface CodexSdkAgentSessionConfig {
  id: string;
  role: AgentSessionRole;
  model?: string;
}

export class CodexSdkAgentSession extends BaseAgentSession implements IAgentSession {
  readonly agentType: AgentType = 'codex';

  private readonly model: string | undefined;
  private readonly codex: Codex;
  private thread: Thread | null = null;
  private abortController: AbortController | null = null;
  private runPromise: Promise<void> | null = null;
  private worktreePath: string | null = null;
  private lastAssistantMessage = '';
  private completing = false;
  private stopping = false;

  constructor(config: CodexSdkAgentSessionConfig) {
    super(config.id, config.role);
    this.model = config.model;
    this.codex = new Codex({ codexPathOverride: findCodexBinaryPath() });
  }

  start(worktreePath: string, prompt: string): Promise<void> {
    try {
      if (this._state !== 'starting') {
        throw new Error(`Cannot start session in state: ${this._state}`);
      }

      this.worktreePath = worktreePath;
      this.thread = this.codex.startThread(this.buildThreadOptions(worktreePath));

      this.emitActivity({
        type: 'system',
        timestamp: Date.now(),
        summary: this.role === 'review' ? 'Starting Codex review...' : 'Starting Codex session...',
        status: 'running',
      });

      this.setState('working');
      this.runPromise = this.runTurn(prompt);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  respond(): Promise<void> {
    return Promise.reject(new Error('Codex board sessions do not ask follow-up questions'));
  }

  followUp(text: string): Promise<void> {
    if (this.role === 'review') {
      return Promise.reject(new Error('Codex review sessions are one-shot'));
    }

    if (this._state !== 'complete' && this._state !== 'failed' && this._state !== 'stopped') {
      return Promise.reject(new Error(`Cannot follow up in state: ${this._state}`));
    }

    if (!this.thread) {
      return Promise.reject(new Error('No active Codex thread'));
    }

    this.stopping = false;
    this.completing = false;
    this.emitActivity({
      type: 'system',
      timestamp: Date.now(),
      summary: 'Continuing Codex session...',
      status: 'running',
    });
    this.setState('working');
    this.runPromise = this.runTurn(text);
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this._state === 'stopped' || this._state === 'complete' || this._state === 'failed') {
      return;
    }

    this.stopping = true;
    this.abortController?.abort();
    try {
      await this.runPromise;
    } catch {
      // Expected when aborting an in-flight SDK turn.
    } finally {
      this.stopping = false;
      this.setState('stopped');
    }
  }

  getOutput(): string {
    return this.lastAssistantMessage;
  }

  private buildThreadOptions(worktreePath: string): ThreadOptions {
    return {
      workingDirectory: worktreePath,
      sandboxMode: this.role === 'review' ? 'read-only' : 'workspace-write',
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
      ...(this.model && { model: this.model }),
    };
  }

  private async runTurn(prompt: string): Promise<void> {
    if (!this.thread) {
      throw new Error('Codex thread was not initialized');
    }

    this.abortController = new AbortController();
    this.completing = false;

    const turnOptions: TurnOptions = {
      signal: this.abortController.signal,
      ...(this.role === 'review' && { outputSchema: REVIEW_FINDINGS_SCHEMA }),
    };

    try {
      const { events } = await this.thread.runStreamed(prompt, turnOptions);

      for await (const event of events) {
        await this.handleEvent(event);
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.abortController = null;
    }
  }

  private async handleEvent(event: ThreadEvent): Promise<void> {
    switch (event.type) {
      case 'thread.started':
      case 'turn.started':
        return;
      case 'item.started':
        this.handleItemStarted(event.item);
        return;
      case 'item.updated':
        this.handleItemUpdated(event.item);
        return;
      case 'item.completed':
        this.handleItemCompleted(event.item);
        return;
      case 'turn.completed':
        await this.handleCompletion();
        return;
      case 'turn.failed':
        this.fail(new Error(event.error.message));
        return;
      case 'error':
        this.fail(new Error(event.message));
        return;
    }
  }

  private handleItemStarted(item: ThreadItem): void {
    if (item.type === 'command_execution') {
      this.emitActivity({
        type: 'tool_use',
        timestamp: Date.now(),
        toolName: 'exec_command',
        toolInput: item.command,
        summary: summarizeCommand(item.command),
        status: 'running',
      });
      return;
    }

    if (item.type === 'mcp_tool_call') {
      this.emitActivity({
        type: 'tool_use',
        timestamp: Date.now(),
        toolName: `${item.server}.${item.tool}`,
        toolInput: JSON.stringify(item.arguments),
        summary: summarizeMcpToolCall(item),
        status: 'running',
      });
      return;
    }

    if (item.type === 'reasoning') {
      this.emitActivity({
        type: 'thinking',
        timestamp: Date.now(),
        summary: 'Thinking...',
        content: item.text,
      });
      return;
    }

    if (item.type === 'web_search') {
      this.emitActivity({
        type: 'tool_use',
        timestamp: Date.now(),
        toolName: 'web_search',
        toolInput: item.query,
        summary: `Search ${truncate(item.query)}`,
        status: 'running',
      });
    }
  }

  private handleItemUpdated(item: ThreadItem): void {
    if (item.type !== 'todo_list') {
      return;
    }

    const total = item.items.length;
    const completed = item.items.filter((todo) => todo.completed).length;
    this.emitActivity({
      type: 'system',
      timestamp: Date.now(),
      summary: `${this.role === 'review' ? 'Review' : 'Implementation'} checklist ${completed}/${total}`,
    });
  }

  private handleItemCompleted(item: ThreadItem): void {
    if (item.type === 'agent_message') {
      this.lastAssistantMessage = item.text;
      this.emitActivity({
        type: 'message',
        timestamp: Date.now(),
        summary: truncate(item.text),
        content: item.text,
      });
      return;
    }

    if (item.type === 'command_execution') {
      this.emitCommandResult(item);
      return;
    }

    if (item.type === 'file_change') {
      this.emitFileChange(item);
      return;
    }

    if (item.type === 'mcp_tool_call') {
      this.emitMcpToolResult(item);
      return;
    }

    const errorMessage = itemErrorMessage(item);
    if (errorMessage) {
      this.emitActivity({
        type: 'error',
        timestamp: Date.now(),
        summary: truncate(errorMessage),
        content: errorMessage,
      });
    }
  }

  private emitCommandResult(item: CommandExecutionItem): void {
    this.emitActivity({
      type: 'tool_result',
      timestamp: Date.now(),
      toolName: 'exec_command',
      summary: summarizeCommand(item.command),
      content: item.aggregated_output || undefined,
      status: item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
        ? 'failed'
        : 'success',
    });
  }

  private emitFileChange(item: FileChangeItem): void {
    const firstChange = item.changes[0];
    const summary = item.changes.length === 1 && firstChange
      ? `${firstChange.kind} ${firstChange.path}`
      : `${item.changes.length} file changes`;
    this.emitActivity({
      type: 'tool_result',
      timestamp: Date.now(),
      toolName: 'apply_patch',
      summary,
      status: item.status === 'failed' ? 'failed' : 'success',
    });
  }

  private emitMcpToolResult(item: McpToolCallItem): void {
    this.emitActivity({
      type: 'tool_result',
      timestamp: Date.now(),
      toolName: `${item.server}.${item.tool}`,
      summary: summarizeMcpToolCall(item),
      content: item.error?.message,
      status: item.status === 'failed' ? 'failed' : 'success',
    });
  }

  private async handleCompletion(): Promise<void> {
    if (this.completing || this._state !== 'working') {
      return;
    }

    this.completing = true;
    const summary = await this.getCompletionSummary();
    this.setState('complete');
    this.emit('onComplete', summary);
    this.completing = false;
  }

  private fail(error: unknown): void {
    if (this.stopping) {
      return;
    }

    if (this._state === 'failed' || this._state === 'stopped' || this._state === 'complete') {
      return;
    }

    const classified = classifyCodexError(error);
    this.emitActivity({
      type: 'error',
      timestamp: Date.now(),
      summary: classified.message,
      content: classified.message,
    });
    this.setState('failed');
    this.emit('onError', classified.message);
  }

  private async getCompletionSummary(): Promise<AgentCompletionSummary> {
    if (!this.worktreePath) {
      return { filesChanged: 0, additions: 0, deletions: 0 };
    }

    try {
      const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], {
        cwd: this.worktreePath,
      });
      const match = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(stdout);
      if (match) {
        return {
          filesChanged: parseInt(match[1], 10) || 0,
          additions: parseInt(match[2], 10) || 0,
          deletions: parseInt(match[3], 10) || 0,
        };
      }
    } catch {
      // Git diff may fail if the worktree path is not a git repository.
    }

    return { filesChanged: 0, additions: 0, deletions: 0 };
  }
}
