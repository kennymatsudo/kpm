/**
 * CodexSdkAgentSession - @openai/codex-sdk-backed board agent session.
 *
 * Implementation sessions run in the task worktree with workspace-write
 * sandboxing. Review sessions run read-only with structured findings output.
 */

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
import {
  summarizeMcpToolCall,
  summarizeThreadItem,
  threadItemErrorMessage,
  todoListProgress,
  truncateCodexText,
} from '../../codex/threadItemPresentation';
import { REVIEW_FINDINGS_SCHEMA } from './reviewOutputContract';
import type {
  AgentCompletionSummary,
  AgentSessionRole,
  AgentType,
  IAgentSession,
} from '../../../shared/agent-types';

export interface CodexSdkAgentSessionConfig {
  id: string;
  role: AgentSessionRole;
  model?: string;
  expectsFindings?: boolean;
  readOnly?: boolean;
}

export class CodexSdkAgentSession extends BaseAgentSession implements IAgentSession {
  readonly agentType: AgentType = 'codex';

  private readonly model: string | undefined;
  private readonly codex: Codex;
  private thread: Thread | null = null;
  private worktreePath: string | null = null;
  private lastAssistantMessage = '';
  private readonly structuredFindings: boolean;
  private readonly readOnly: boolean;

  constructor(config: CodexSdkAgentSessionConfig) {
    super(config.id, config.role, config.expectsFindings);
    this.model = config.model;
    this.structuredFindings = config.expectsFindings ?? config.role === 'review';
    this.readOnly = config.readOnly ?? config.role === 'review';
    this.codex = new Codex({ codexPathOverride: findCodexBinaryPath() });
  }

  start(worktreePath: string, prompt: string): Promise<void> {
    try {
      this.assertStarting();

      this.worktreePath = worktreePath;
      this.thread = this.codex.startThread(this.buildThreadOptions(worktreePath));

      this.beginTurn(this.role === 'review' ? 'Starting Codex review...' : 'Starting Codex session...');
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

    const followUpError = this.checkFollowUpAllowed();
    if (followUpError) {
      return Promise.reject(followUpError);
    }

    if (!this.thread) {
      return Promise.reject(new Error('No active Codex thread'));
    }

    this.beginTurn('Continuing Codex session...');
    this.runPromise = this.runTurn(text);
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    await this.stopSession(() => this.abortController?.abort());
  }

  getOutput(): string {
    return this.lastAssistantMessage;
  }

  protected finalOutput(): string | null {
    return this.getOutput() || null;
  }

  private buildThreadOptions(worktreePath: string): ThreadOptions {
    return {
      workingDirectory: worktreePath,
      sandboxMode: this.readOnly ? 'read-only' : 'workspace-write',
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

    await this.runGuardedTurn(async (signal) => {
      const turnOptions: TurnOptions = {
        signal,
        ...(this.structuredFindings && { outputSchema: REVIEW_FINDINGS_SCHEMA }),
      };

      const { events } = await this.thread!.runStreamed(prompt, turnOptions);

      for await (const event of events) {
        await this.handleEvent(event);
      }
    }, classifyCodexError);
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
        await this.maybeCompleteTurn(() => this.getCompletionSummary());
        return;
      case 'turn.failed':
        this.failTurn(new Error(event.error.message), classifyCodexError);
        return;
      case 'error':
        this.failTurn(new Error(event.message), classifyCodexError);
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
        summary: summarizeThreadItem(item),
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
        summary: summarizeThreadItem(item),
        status: 'running',
      });
    }
  }

  private handleItemUpdated(item: ThreadItem): void {
    if (item.type !== 'todo_list') {
      return;
    }

    const { completed, total } = todoListProgress(item);
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
        summary: summarizeThreadItem(item),
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

    const errorMessage = threadItemErrorMessage(item);
    if (errorMessage) {
      this.emitActivity({
        type: 'error',
        timestamp: Date.now(),
        summary: truncateCodexText(errorMessage),
        content: errorMessage,
      });
    }
  }

  private emitCommandResult(item: CommandExecutionItem): void {
    this.emitActivity({
      type: 'tool_result',
      timestamp: Date.now(),
      toolName: 'exec_command',
      summary: summarizeThreadItem(item),
      content: item.aggregated_output || undefined,
      status: item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
        ? 'failed'
        : 'success',
    });
  }

  private emitFileChange(item: FileChangeItem): void {
    this.emitActivity({
      type: 'tool_result',
      timestamp: Date.now(),
      toolName: 'apply_patch',
      summary: summarizeThreadItem(item),
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

  private async getCompletionSummary(): Promise<AgentCompletionSummary> {
    return this.computeGitDiffSummary(this.worktreePath ?? undefined);
  }
}
