import {
  Codex,
  type CodexOptions,
  type Input,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
  type Usage,
  type UserInput,
} from '@openai/codex-sdk';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import { findCodexBinaryPath } from './binary';
import { classifyCodexError } from './errors';
import { registerCodexMcpSession, type CodexMcpRegistration } from './KpmCodexMcpServer';
import { summarizeThreadItem } from './threadItemPresentation';
import type { PlanContext } from '../claude/prompts';
import { buildItemReferenceTable } from '../claude/prompts/planFormatting';

type SessionEndReason = 'completed' | 'error' | 'closed';

export interface CodexChatSessionConfig {
  context: PlanContext;
  chatSessionId?: string;
  resumeThreadId?: string;
  model?: string;
  onMessage: (msg: unknown) => void;
  onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
  onReady?: (threadId: string) => void;
  /** Injectable KPM MCP registration factory. The streaming shell supplies this so provider setup stays outside the session body. */
  registerMcpSession?: () => Promise<CodexMcpRegistration>;
}

interface QueuedTurn {
  input: Input;
  prependSystemPrompt: boolean;
}

function buildCodexSystemPrompt(context: PlanContext): string {
  const repos = context.repos.length > 0
    ? context.repos.map((repo) => `- \`${repo.active_worktree_path ?? repo.path}\``).join('\n')
    : 'No repos connected.';
  const planSummary = context.planItems.length > 0
    ? buildItemReferenceTable(context.planItems)
    : 'Empty.';
  const continuation = context.continuationHistory && context.continuationHistory.length > 0
    ? `\n# Prior Conversation\n\n${context.continuationHistory
        .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
        .join('\n\n')}\n`
    : '';
  const focusDocument = context.focusDocument
    ? `\n# Focused Document\nPath: \`${context.focusDocument.path}\`\nTitle: ${context.focusDocument.title}\n\n<document>\n${context.focusDocument.content}\n</document>\n`
    : '';
  const projectContext = context.claudeMdContent?.trim()
    ? `\n# Project Context\n\n${context.claudeMdContent.trim()}\n`
    : '';

  return `You are Codex running inside KPM's main chat. Help the user understand codebases, plan work, and reason across connected repos.

# Operating Rules
- This is a read-only chat context. Do not modify repo or project files from chat.
- Jira, Linear, Confluence, and GitHub exports must not leak KPM-local fields or @plan internals.
- Plan data lives in KPM SQLite, not in connected repos.
- If the user asks to change the plan, use KPM plan tools so changes flow through KPM's proposal and review path.
- For document, project-context, move, or delete requests, use KPM proposal tools rather than editing files directly.
- Keep replies concise and utilitarian.

# Project
Name: ${context.project.name}
ID: \`${context.project.id}\`
Phase: ${context.project.phase}
Project folder: \`${context.project.folder_path}\`

Connected repos:
${repos}
${continuation}${focusDocument}${projectContext}
# Current Plan
${context.planItems.length} items.
${planSummary}

## Plan References
Use \`@plan/<uuid>\` when referring to plan items in markdown. Only use UUIDs listed in the current plan above.`;
}

function buildInitialPrompt(systemPrompt: string, input: Input): Input {
  if (typeof input === 'string') {
    return `${systemPrompt}\n\n# User\n\n${input}`;
  }
  return [
    { type: 'text', text: systemPrompt },
    ...input,
  ];
}

function contentBlocksToCodexInput(content: ContentBlockParam[]): Input {
  const input: UserInput[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      input.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'image' && block.source.type === 'base64') {
      input.push({
        type: 'text',
        text: '[Image attachment omitted: Codex SDK chat supports local image paths before base64 conversion. Send images through the Codex provider with file-path attachments in a follow-up slice.]',
      });
      continue;
    }
    if (block.type === 'document') {
      input.push({
        type: 'text',
        text: '[Document attachment omitted: Codex SDK chat adapter does not yet translate base64 document blocks.]',
      });
    }
  }
  return input;
}

function toolUseName(item: ThreadItem): string | null {
  if (item.type === 'command_execution') return 'Bash';
  if (item.type === 'mcp_tool_call') return `mcp__${item.server}__${item.tool}`;
  if (item.type === 'web_search') return 'WebSearch';
  if (item.type === 'file_change') return 'apply_patch';
  if (item.type === 'todo_list') return 'todo_list';
  return null;
}

function toolUseInput(item: ThreadItem): Record<string, unknown> {
  if (item.type === 'command_execution') return { command: item.command };
  if (item.type === 'mcp_tool_call') return { arguments: item.arguments };
  if (item.type === 'web_search') return { query: item.query };
  if (item.type === 'file_change') return { changes: item.changes };
  if (item.type === 'todo_list') return { summary: summarizeThreadItem(item) };
  return {};
}

function usageToClaudeShape(usage: Usage): {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
} {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cached_input_tokens,
    cache_creation_input_tokens: 0,
  };
}

function codexEnvWithMcpToken(token: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  env.KPM_MCP_TOKEN = token;
  return env;
}

function codexConfigWithKpmMcp(url: string): NonNullable<CodexOptions['config']> {
  return {
    mcp_servers: {
      kpm: {
        url,
        bearer_token_env_var: 'KPM_MCP_TOKEN',
        required: true,
        tool_timeout_sec: 60,
        default_tools_approval_mode: 'approve',
      },
    },
  };
}

export class CodexChatSession {
  private readonly config: CodexChatSessionConfig;
  private readonly systemPrompt: string;
  private codex: Codex | null = null;
  private thread: Thread | null = null;
  private mcpRegistration: CodexMcpRegistration | null = null;
  private abortController: AbortController | null = null;
  private active = false;
  private ready = false;
  private closing = false;
  private processing = false;
  private closePromise: Promise<void> | null = null;
  private turnPromise: Promise<void> | null = null;
  private queue: QueuedTurn[] = [];
  private threadId: string | null;

  constructor(config: CodexChatSessionConfig) {
    this.config = config;
    this.systemPrompt = buildCodexSystemPrompt(config.context);
    this.threadId = config.resumeThreadId ?? null;
  }

  async start(initialMessage: string | ContentBlockParam[]): Promise<void> {
    if (this.active) {
      throw new Error('Session already started');
    }
    const input = typeof initialMessage === 'string'
      ? initialMessage
      : contentBlocksToCodexInput(initialMessage);

    this.mcpRegistration = await (this.config.registerMcpSession ?? (() => registerCodexMcpSession({
      projectId: this.config.context.project.id,
      chatSessionId: this.config.chatSessionId,
      focus: Boolean(this.config.context.focusDocument),
    })))();

    try {
      this.codex = new Codex({
        codexPathOverride: findCodexBinaryPath(),
        env: codexEnvWithMcpToken(this.mcpRegistration.token),
        config: codexConfigWithKpmMcp(this.mcpRegistration.url),
      });
      this.thread = this.threadId
        ? this.codex.resumeThread(this.threadId, this.buildThreadOptions())
        : this.codex.startThread(this.buildThreadOptions());

      this.active = true;
      this.ready = true;
      if (this.threadId) {
        this.config.onReady?.(this.threadId);
      }
      this.turnPromise = this.runTurnAndDrain({ input, prependSystemPrompt: !this.threadId });
    } catch (error) {
      this.mcpRegistration.dispose();
      this.mcpRegistration = null;
      throw error;
    }
  }

  send(text: string): void {
    this.enqueue({ input: text, prependSystemPrompt: false });
  }

  sendUserContent(content: ContentBlockParam[]): void {
    this.enqueue({ input: contentBlocksToCodexInput(content), prependSystemPrompt: false });
  }

  interrupt(): Promise<void> {
    this.abortController?.abort();
    return Promise.resolve();
  }

  pendingQueuedCount(): number {
    return this.queue.length;
  }

  cancelLastQueued(): QueuedTurn | null {
    return this.queue.pop() ?? null;
  }

  getSessionId(): string | null {
    return this.threadId;
  }

  isActive(): boolean {
    return this.active;
  }

  isReady(): boolean {
    return this.ready && !this.closing;
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = (async () => {
      this.closing = true;
      this.ready = false;
      this.queue = [];
      this.abortController?.abort();
      try {
        await this.turnPromise;
      } catch {
        // Ignore errors during close.
      }
      this.active = false;
      this.processing = false;
      this.disposeMcpRegistration();
      this.config.onSessionEnd?.('closed');
    })();
    try {
      await this.closePromise;
    } finally {
      this.closePromise = null;
    }
  }

  private buildThreadOptions() {
    const additionalDirectories = this.config.context.repos
      .map((repo) => repo.active_worktree_path ?? repo.path)
      .filter((repoPath): repoPath is string => Boolean(repoPath));
    return {
      ...(this.config.model ? { model: this.config.model } : {}),
      workingDirectory: this.config.context.project.folder_path,
      additionalDirectories,
      skipGitRepoCheck: true,
      sandboxMode: 'read-only' as const,
      approvalPolicy: 'never' as const,
      networkAccessEnabled: false,
      webSearchMode: 'disabled' as const,
    };
  }

  private enqueue(turn: QueuedTurn): void {
    if (!this.active || !this.ready) {
      throw new Error('Session is not ready');
    }
    this.queue.push(turn);
    if (!this.processing) {
      this.turnPromise = this.drainQueue();
    }
  }

  private async runTurnAndDrain(turn: QueuedTurn): Promise<void> {
    await this.runTurn(turn);
    await this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    while (!this.closing && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return;
      this.config.onMessage({
        type: 'user',
        message: { role: 'user', content: [] },
      });
      await this.runTurn(next);
    }
  }

  private async runTurn(turn: QueuedTurn): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.abortController = new AbortController();
    try {
      const input = turn.prependSystemPrompt
        ? buildInitialPrompt(this.systemPrompt, turn.input)
        : turn.input;
      if (!this.thread) {
        throw new Error('Codex thread is not initialized');
      }
      const { events } = await this.thread.runStreamed(input, {
        signal: this.abortController.signal,
      });
      for await (const event of events) {
        this.handleEvent(event);
      }
    } catch (error) {
      if (this.closing) return;
      const classified = classifyCodexError(error);
      const err = new Error(classified.message);
      this.disposeMcpRegistration();
      this.config.onSessionEnd?.('error', err);
    } finally {
      this.abortController = null;
      if (this.processing) {
        this.processing = false;
      }
    }
  }

  private handleEvent(event: ThreadEvent): void {
    switch (event.type) {
      case 'thread.started':
        this.threadId = event.thread_id;
        this.config.onReady?.(event.thread_id);
        return;
      case 'turn.started':
        return;
      case 'item.started':
      case 'item.updated':
        this.handleItemProgress(event.item);
        return;
      case 'item.completed':
        this.handleItemCompleted(event.item);
        return;
      case 'turn.completed':
        this.config.onMessage({
          type: 'result',
          usage: usageToClaudeShape(event.usage),
          session_id: this.threadId,
        });
        return;
      case 'turn.failed':
        this.disposeMcpRegistration();
        this.config.onSessionEnd?.('error', new Error(event.error.message));
        return;
      case 'error':
        this.disposeMcpRegistration();
        this.config.onSessionEnd?.('error', new Error(event.message));
        return;
    }
  }

  private handleItemProgress(item: ThreadItem): void {
    if (item.type === 'reasoning' && item.text) {
      this.config.onMessage({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: item.text }] },
      });
      return;
    }

    const name = toolUseName(item);
    if (!name) return;
    this.config.onMessage({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: item.id,
          name,
          input: toolUseInput(item),
        }],
      },
    });
  }

  private handleItemCompleted(item: ThreadItem): void {
    if (item.type === 'agent_message') {
      this.config.onMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: item.text }] },
      });
      return;
    }

    if (item.type === 'error') {
      this.config.onMessage({
        type: 'assistant',
        error: 'server_error',
        message: { content: [{ type: 'text', text: item.message }] },
      });
    }
  }

  private disposeMcpRegistration(): void {
    this.mcpRegistration?.dispose();
    this.mcpRegistration = null;
  }
}
