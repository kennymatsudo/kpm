import type { AgentEffortLevel } from '../../../shared/types';
import type {
  AgentCompletionSummary,
  AgentSessionRole,
  AgentSessionUsage,
  AgentType,
  IAgentSession,
} from '../../../shared/agent-types';
import {
  parsePiModelSelector,
  resolvePiModelSelection,
  resolvePiProjectTrust,
} from '../../pi/PiChatSession';
import { BaseAgentSession } from './BaseAgentSession';

const IMPLEMENT_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'] as const;
const READ_ONLY_TOOLS = ['read', 'grep', 'find', 'ls'] as const;

interface PiSessionStats {
  sessionId: string;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  cost: number;
}

interface PiUsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost?: { total?: number };
}

interface PiAssistantMessage {
  role: 'assistant';
  content: (
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string }
    | { type: string; [key: string]: unknown }
  )[];
  usage?: PiUsageLike;
  stopReason?: string;
  errorMessage?: string;
}

export interface PiBoardSessionHandle {
  subscribe(listener: (event: unknown) => void): () => void;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  getSessionStats(): PiSessionStats;
  getModel(): string | null;
}

export interface CreatePiBoardSessionOptions {
  cwd: string;
  systemPrompt: string;
  model?: string;
  effort?: AgentEffortLevel;
  readOnly: boolean;
}

export type CreatePiBoardSessionFn = (
  options: CreatePiBoardSessionOptions,
) => Promise<PiBoardSessionHandle>;

export interface PiSdkAgentSessionConfig {
  id: string;
  role: AgentSessionRole;
  systemPrompt: string;
  model?: string;
  effort?: AgentEffortLevel;
  expectsFindings?: boolean;
  readOnly?: boolean;
  createSession?: CreatePiBoardSessionFn;
}

function asAssistantMessage(message: unknown): PiAssistantMessage | null {
  if (!message || typeof message !== 'object') return null;
  if ((message as { role?: unknown }).role !== 'assistant') return null;
  return message as PiAssistantMessage;
}

function toolInput(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const input = args as Record<string, unknown>;
  const primary = input.path ?? input.command ?? input.pattern ?? input.query;
  return typeof primary === 'string' ? primary : JSON.stringify(input);
}

function toolSummary(toolName: string, args: unknown): string {
  const input = toolInput(args);
  switch (toolName) {
    case 'read': return `Read ${input || 'file'}`;
    case 'edit': return `Edit ${input || 'file'}`;
    case 'write': return `Write ${input || 'file'}`;
    case 'bash': return `Run ${input || 'command'}`;
    case 'grep': return `Search for ${input || 'pattern'}`;
    case 'find': return `Find ${input || 'files'}`;
    case 'ls': return `List ${input || 'directory'}`;
    default: return toolName;
  }
}

function resultText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((block): block is { type: 'text'; text: string } =>
      Boolean(block) && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string')
    .map((block) => block.text)
    .join('\n');
  return text || undefined;
}

function usageDelta(before: PiSessionStats, after: PiSessionStats, model: string | null): AgentSessionUsage {
  return {
    model,
    inputTokens: Math.max(0, after.tokens.input - before.tokens.input),
    outputTokens: Math.max(0, after.tokens.output - before.tokens.output),
    cacheCreationTokens: Math.max(0, after.tokens.cacheWrite - before.tokens.cacheWrite),
    cacheReadTokens: Math.max(0, after.tokens.cacheRead - before.tokens.cacheRead),
    totalCostUsd: Math.max(0, after.cost - before.cost),
    sdkSessionId: after.sessionId,
  };
}

async function createRealPiBoardSession(
  options: CreatePiBoardSessionOptions,
): Promise<PiBoardSessionHandle> {
  const pi = await import('@earendil-works/pi-coding-agent');
  const tools = options.readOnly ? [...READ_ONLY_TOOLS] : [...IMPLEMENT_TOOLS];
  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: pi.getAgentDir(),
    systemPromptOverride: () => options.systemPrompt,
    appendSystemPromptOverride: () => [],
    // User extensions still register configured model providers. Project-local
    // resources stay excluded because KPM supplies the task context itself.
    noExtensions: false,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload({ resolveProjectTrust: resolvePiProjectTrust });

  const { session } = await pi.createAgentSession({
    cwd: options.cwd,
    resourceLoader,
    sessionManager: pi.SessionManager.inMemory(options.cwd),
    tools,
    ...(options.effort ? { thinkingLevel: options.effort } : {}),
  });

  if (options.model) {
    const selector = parsePiModelSelector(options.model);
    const resolution = selector
      ? await resolvePiModelSelection(session.modelRuntime, selector)
      : undefined;
    if (!resolution) {
      session.dispose();
      throw new Error(`Pi model is not available: ${options.model}`);
    }
    await session.setModel(resolution.model);
    if (resolution.usedFallback) {
      console.warn(
        `[PiSdkAgentSession] Pi model "${options.model}" is not registered; `
        + `using "${resolution.model.provider}/${resolution.model.id}" instead.`,
      );
    }
  }

  return {
    subscribe: (listener) => session.subscribe(listener),
    prompt: (text) => session.prompt(text),
    abort: () => session.abort(),
    dispose: () => session.dispose(),
    getSessionStats: () => session.getSessionStats(),
    getModel: () => session.model ? `${session.model.provider}/${session.model.id}` : null,
  };
}

export class PiSdkAgentSession extends BaseAgentSession implements IAgentSession {
  readonly agentType: AgentType = 'pi';

  private readonly systemPrompt: string;
  private readonly model: string | undefined;
  private readonly effort: AgentEffortLevel | undefined;
  private readonly readOnly: boolean;
  private readonly createSession: CreatePiBoardSessionFn;
  private session: PiBoardSessionHandle | null = null;
  private unsubscribe: (() => void) | null = null;
  private worktreePath: string | null = null;
  private lastAssistantMessage = '';
  private finalError: string | null = null;

  constructor(config: PiSdkAgentSessionConfig) {
    super(config.id, config.role, config.expectsFindings);
    this.systemPrompt = config.systemPrompt;
    this.model = config.model;
    this.effort = config.effort;
    this.readOnly = config.readOnly ?? config.role === 'review';
    this.createSession = config.createSession ?? createRealPiBoardSession;
  }

  async start(worktreePath: string, prompt: string): Promise<void> {
    this.assertStarting();
    this.worktreePath = worktreePath;
    this.session = await this.createSession({
      cwd: worktreePath,
      systemPrompt: this.systemPrompt,
      model: this.model,
      effort: this.effort,
      readOnly: this.readOnly,
    });
    this.unsubscribe = this.session.subscribe((event) => this.handleEvent(event));
    this.beginTurn(this.role === 'review' ? 'Starting Pi review...' : 'Starting Pi session...');
    this.runPromise = this.runTurn(prompt);
  }

  respond(): Promise<void> {
    return Promise.reject(new Error('Pi board sessions do not ask follow-up questions'));
  }

  followUp(text: string): Promise<void> {
    if (this.role === 'review') {
      return Promise.reject(new Error('Pi review sessions are one-shot'));
    }
    const followUpError = this.checkFollowUpAllowed();
    if (followUpError) return Promise.reject(followUpError);
    if (!this.session) return Promise.reject(new Error('No active Pi session'));

    this.beginTurn('Continuing Pi session...');
    this.runPromise = this.runTurn(text);
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    await this.stopSession(
      () => {
        if (this.abortController) {
          this.abortController.abort();
          return;
        }
        return this.session?.abort();
      },
      () => this._state === 'stopped',
    );
    this.dispose();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.session?.dispose();
    this.session = null;
  }

  protected finalOutput(): string | null {
    return this.lastAssistantMessage || null;
  }

  private async runTurn(prompt: string): Promise<void> {
    this.finalError = null;
    await this.runGuardedTurn(async (signal) => {
      if (!this.session) throw new Error('Pi session was not initialized');
      const before = this.session.getSessionStats();
      const abort = () => { void this.session?.abort(); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        await this.session.prompt(prompt);
      } finally {
        signal.removeEventListener('abort', abort);
      }
      if (this.finalError) throw new Error(this.finalError);
      this.emit('onUsage', usageDelta(before, this.session.getSessionStats(), this.session.getModel()));
      await this.maybeCompleteTurn(() => this.getCompletionSummary());
    }, (error) => ({ message: error instanceof Error ? error.message : String(error) }));
  }

  private handleEvent(event: unknown): void {
    const typed = event as { type?: unknown };
    switch (typed.type) {
      case 'message_end':
        this.handleMessageEnd(event as { message?: unknown });
        return;
      case 'tool_execution_start':
        this.handleToolStart(event as { toolName?: unknown; args?: unknown });
        return;
      case 'tool_execution_end':
        this.handleToolEnd(event as { toolName?: unknown; result?: unknown; isError?: unknown });
        return;
      default:
        return;
    }
  }

  private handleMessageEnd(event: { message?: unknown }): void {
    const message = asAssistantMessage(event.message);
    if (!message) return;

    const thinking = message.content
      .filter((block): block is { type: 'thinking'; thinking: string } => block.type === 'thinking')
      .map((block) => block.thinking)
      .join('');
    if (thinking) {
      this.emitActivity({
        type: 'thinking',
        timestamp: Date.now(),
        summary: 'Thinking...',
        content: thinking,
      });
    }

    const text = message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (text) {
      this.lastAssistantMessage = text;
      this.emitActivity({
        type: 'message',
        timestamp: Date.now(),
        summary: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
        content: text,
      });
    }

    this.finalError = message.stopReason === 'error'
      ? message.errorMessage ?? 'Pi agent stopped with an error'
      : null;
  }

  private handleToolStart(event: { toolName?: unknown; args?: unknown }): void {
    if (typeof event.toolName !== 'string') return;
    this.emitActivity({
      type: 'tool_use',
      timestamp: Date.now(),
      toolName: event.toolName,
      toolInput: toolInput(event.args),
      summary: toolSummary(event.toolName, event.args),
      status: 'running',
    });
  }

  private handleToolEnd(event: { toolName?: unknown; result?: unknown; isError?: unknown }): void {
    if (typeof event.toolName !== 'string') return;
    this.emitActivity({
      type: 'tool_result',
      timestamp: Date.now(),
      toolName: event.toolName,
      summary: `${event.toolName} ${event.isError === true ? 'failed' : 'completed'}`,
      content: resultText(event.result),
      status: event.isError === true ? 'failed' : 'success',
    });
  }

  private getCompletionSummary(): Promise<AgentCompletionSummary> {
    return this.computeGitDiffSummary(this.worktreePath ?? undefined);
  }
}
