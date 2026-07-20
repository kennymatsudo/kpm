import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import type * as PiCodingAgent from '@earendil-works/pi-coding-agent';
import type { ToolDefinition as PiSdkToolDefinition } from '@earendil-works/pi-coding-agent';
import { BaseTurnQueueChatSession, type SessionEndReason } from '../services/streaming/BaseTurnQueueChatSession';
import { getConfig } from '../config';
import { buildPiKpmTools, type PiKpmToolDefinition, type PiToolImageContent } from './kpmToolAdapter';
import type { PlanContext } from '../chat/prompts';
import { buildUserGlobalInstructionsSection } from '../chat/prompts';
import { buildItemReferenceTable } from '../chat/prompts/planFormatting';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';

/** Built-in pi tools that are read-only against the filesystem. `write`, `edit`, and `bash` are never included (P7). */
const READ_ONLY_BUILTIN_TOOLS = ['read', 'grep', 'find', 'ls'] as const;

interface PiUsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Structurally compatible with pi's real `AgentSession` — narrowed to what PiChatSession needs. */
export interface PiSessionHandle {
  getSessionId: () => string;
  subscribe: (listener: (event: unknown) => void) => () => void;
  prompt: (text: string, options?: { images?: PiToolImageContent[] }) => Promise<void>;
  abort: () => Promise<void>;
}

export interface CreatePiSessionOptions {
  cwd: string;
  systemPrompt: string;
  tools: PiKpmToolDefinition[];
  toolNames: string[];
  /** `"<provider>/<modelId>"` selection resolved via the pi SDK's ModelRegistry after session creation. Unset keeps pi's own default model. */
  model?: string;
  /** pi's own persisted session id to continue. Unset starts a fresh persisted session. */
  resumeSessionId?: string;
}

export type CreatePiSessionFn = (options: CreatePiSessionOptions) => Promise<PiSessionHandle>;

export interface PiChatSessionConfig {
  context: PlanContext;
  chatSessionId?: string;
  resumeSessionId?: string;
  /** `"<provider>/<modelId>"` selection. Unset keeps pi's own default model. */
  model?: string;
  onMessage: (msg: unknown) => void;
  onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
  onReady?: (sessionId: string) => void;
  /** KPM tools adapted by the caller for this session. Defaults to building from context for tests/backcompat. */
  kpmTools?: { tools: PiKpmToolDefinition[]; toolNames: string[] };
  /** Injectable session factory, defaulting to the real pi SDK. Tests inject a fake to avoid live model calls. */
  createSession?: CreatePiSessionFn;
}

interface QueuedTurn {
  text: string;
  images: PiToolImageContent[];
}

/**
 * Defensive tool-call gate: blocks anything outside the read-only builtin +
 * KPM tool allowlist. Exported standalone so it is unit-testable without the
 * real pi extension runtime; `createRealPiSession` wires the same function
 * into `pi.on('tool_call', ...)`.
 */
export function buildToolCallGate(
  allowedToolNames: readonly string[],
): (toolName: string) => { block: true; reason: string } | undefined {
  const allowed = new Set(allowedToolNames);
  return (toolName: string) => {
    if (allowed.has(toolName)) return undefined;
    return { block: true, reason: `Tool "${toolName}" is not available in this read-only chat session.` };
  };
}

/**
 * Parse a `"<provider>/<modelId>"` model selector into its parts. Returns
 * undefined for an empty selector or one with no `/` separator.
 */
export function parsePiModelSelector(selector: string): { provider: string; modelId: string } | undefined {
  const separatorIndex = selector.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex === selector.length - 1) return undefined;
  return {
    provider: selector.slice(0, separatorIndex),
    modelId: selector.slice(separatorIndex + 1),
  };
}

/** Structurally compatible with pi's real `ModelRegistry` — narrowed to what model selection needs. */
export interface PiModelRegistryHandle<TModel extends { provider: string; id: string }> {
  find: (provider: string, modelId: string) => TModel | undefined;
  getAvailable: () => TModel[];
}

export interface PiModelSelectionResult<TModel> {
  model: TModel;
  /** True when the exact `provider/modelId` selector missed and this is a same-provider substitute. */
  usedFallback: boolean;
}

/**
 * Resolve a parsed `{ provider, modelId }` selector against a live `ModelRegistry`.
 *
 * Falls back to any other model already registered under the same provider when
 * the exact modelId misses, rather than giving up on the provider entirely.
 * `listPiProviders()`'s enumeration and the `ModelRegistry` a chat session later
 * builds are two independent extension loads — a provider that registers with a
 * different exact model catalog between the two (or, for an extension-registered
 * provider like cursor, one enumerated via a guessed placeholder id — see
 * `UNRESOLVED_MODEL_ID` in `providers.ts`) would otherwise silently keep pi's
 * construction-time default model from an unrelated provider, running the turn
 * on a provider the user never selected.
 */
export function resolvePiModelSelection<TModel extends { provider: string; id: string }>(
  modelRegistry: PiModelRegistryHandle<TModel>,
  selector: { provider: string; modelId: string },
): PiModelSelectionResult<TModel> | undefined {
  const exact = modelRegistry.find(selector.provider, selector.modelId);
  if (exact) return { model: exact, usedFallback: false };
  const fallback = modelRegistry.getAvailable().find((model) => model.provider === selector.provider);
  return fallback ? { model: fallback, usedFallback: true } : undefined;
}

function buildPiSystemPrompt(context: PlanContext): string {
  const repos = context.repos.length > 0
    ? context.repos.map((repo) => `- \`${resolveEffectiveRepoPath(repo)}\``).join('\n')
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
  const projectContext = context.contextFileContent?.trim()
    ? `\n# Project Context\n\n${context.contextFileContent.trim()}\n`
    : '';
  const userPrefsSection = buildUserGlobalInstructionsSection(context.userGlobalInstructions);
  const userPrefs = userPrefsSection ? `\n${userPrefsSection}` : '';

  return `You are pi running inside KPM's main chat. Help the user understand codebases, plan work, and reason across connected repos.

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
${continuation}${focusDocument}${projectContext}${userPrefs}
# Current Plan
${context.planItems.length} items.
${planSummary}

## Plan References
Use \`@plan/<uuid>\` when referring to plan items in markdown. Only use UUIDs listed in the current plan above.`;
}

function contentBlocksToPiPrompt(content: ContentBlockParam[]): { text: string; images: PiToolImageContent[] } {
  const textParts: string[] = [];
  const images: PiToolImageContent[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      textParts.push(block.text);
      continue;
    }
    if (block.type === 'image' && block.source.type === 'base64') {
      images.push({ type: 'image', data: block.source.data, mimeType: block.source.media_type });
      continue;
    }
    if (block.type === 'document') {
      textParts.push('[Document attachment omitted: pi chat adapter does not yet translate base64 document blocks.]');
    }
  }
  return { text: textParts.join('\n\n'), images };
}

function usageToClaudeShape(usage: PiUsageLike | undefined): {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
} {
  return {
    input_tokens: usage?.input ?? 0,
    output_tokens: usage?.output ?? 0,
    cache_read_input_tokens: usage?.cacheRead ?? 0,
    cache_creation_input_tokens: usage?.cacheWrite ?? 0,
  };
}

type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: string; [key: string]: unknown };

interface AssistantMessageLike {
  role: 'assistant';
  content: AssistantContentBlock[];
  usage?: PiUsageLike;
  stopReason?: string;
  errorMessage?: string;
}

function asAssistantMessage(message: unknown): AssistantMessageLike | null {
  if (!message || typeof message !== 'object') return null;
  const candidate = message as { role?: unknown };
  if (candidate.role !== 'assistant') return null;
  return message as AssistantMessageLike;
}

/** Find the last assistant message with usage in an `agent_end` message list, scanning newest-first. */
function extractLastAssistantUsage(messages: unknown[] | undefined): PiUsageLike | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const usage = asAssistantMessage(messages[i])?.usage;
    if (usage) return usage;
  }
  return undefined;
}

/**
 * Always denies pi's project-trust gate, regardless of what it reports about
 * the global/CLI extensions it already pre-loaded to ask the question.
 *
 * `DefaultResourceLoader.reload()` (`resource-loader.js`) only auto-discovers
 * `<cwd>/.pi/extensions` (and `.pi/skills`, `.pi/prompts`, `.pi/themes`) or
 * loads project-configured extension packages when
 * `SettingsManager.isProjectTrusted()` is true — both are gated behind an
 * `if (projectTrusted)` check in `addAutoDiscoveredResources`
 * (`package-manager.js`), and `SettingsManager.loadFromStorage` returns `{}`
 * for the project scope whenever untrusted, so `<cwd>/.pi/settings.json`'s
 * `packages` never get read either. Returning `false` here keeps the
 * connected repo's own `.pi/` directory out of every load — global/user
 * extensions under `~/.pi/agent` (e.g. `pi-cursor-sdk`) are unaffected, since
 * those are resolved from global settings independent of project trust.
 */
export function resolvePiProjectTrust(): Promise<boolean> {
  return Promise.resolve(false);
}

/**
 * Resolve the pi `SessionManager` backing a session.
 *
 * When `resumeSessionId` is set, looks up that persisted session under `cwd`
 * (`SessionManager.list` is scoped to this exact cwd's session directory, so
 * this stays cheap regardless of how many unrelated pi CLI sessions the user
 * has elsewhere) and opens it via `SessionManager.open`, restoring pi's own
 * conversation history — see `createAgentSession`'s use of
 * `sessionManager.buildSessionContext()` to seed `agent.state.messages`.
 * When unset, or when the id can no longer be found (e.g. the file was
 * pruned), starts a fresh persisted session via `SessionManager.create` so
 * its id can be captured via `onReady` and reused on the next reconnect.
 */
export async function resolvePiSessionManager(
  pi: typeof PiCodingAgent,
  cwd: string,
  resumeSessionId: string | undefined,
): Promise<PiCodingAgent.SessionManager> {
  if (!resumeSessionId) return pi.SessionManager.create(cwd);
  try {
    const sessions = await pi.SessionManager.list(cwd);
    const match = sessions.find((info) => info.id === resumeSessionId);
    if (match) return pi.SessionManager.open(match.path, undefined, cwd);
  } catch (error) {
    console.warn(`[PiChatSession] Failed to look up persisted pi session "${resumeSessionId}":`, error);
  }
  console.warn(`[PiChatSession] Could not find persisted pi session "${resumeSessionId}" under ${cwd}; starting a new session.`);
  return pi.SessionManager.create(cwd);
}

/**
 * Real pi SDK wiring, isolated in its own function and loaded via dynamic
 * `import()`. @earendil-works/pi-coding-agent is ESM-only ("type": "module",
 * no `require` export condition); a static import would compile to a
 * `require()` call in the electron-vite CJS main bundle and throw
 * ERR_PACKAGE_PATH_NOT_EXPORTED at runtime. Dynamic `import()` uses Node's
 * ESM loader regardless of the caller's module format.
 */
async function createRealPiSession(options: CreatePiSessionOptions): Promise<PiSessionHandle> {
  const pi = await import('@earendil-works/pi-coding-agent');
  const allowedToolNames = [...READ_ONLY_BUILTIN_TOOLS, ...options.toolNames];
  const gate = buildToolCallGate(allowedToolNames);

  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: pi.getAgentDir(),
    systemPromptOverride: () => options.systemPrompt,
    // Global/CLI extensions load so pi.dev extension-registered providers
    // (e.g. `cursor`, via `pi-cursor-sdk`) register into the session's model
    // registry. Project-local extensions stay excluded via resolveProjectTrust below.
    noExtensions: false,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [
      (extensionApi) => {
        extensionApi.on('tool_call', (event) => gate(event.toolName));
      },
    ],
  });
  await resourceLoader.reload({ resolveProjectTrust: resolvePiProjectTrust });

  const { session } = await pi.createAgentSession({
    cwd: options.cwd,
    sessionManager: await resolvePiSessionManager(pi, options.cwd, options.resumeSessionId),
    tools: allowedToolNames,
    customTools: options.tools as unknown as PiSdkToolDefinition[],
    resourceLoader,
  });

  if (options.model) {
    const selector = parsePiModelSelector(options.model);
    const resolution = selector ? resolvePiModelSelection(session.modelRegistry, selector) : undefined;
    if (resolution) {
      await session.setModel(resolution.model);
      if (resolution.usedFallback) {
        console.warn(`[PiChatSession] pi model "${options.model}" is not registered; using "${resolution.model.provider}/${resolution.model.id}" instead so the requested provider still runs.`);
      }
    } else {
      console.warn(`[PiChatSession] Could not resolve pi model "${options.model}"; keeping the session default.`);
    }
  }

  return {
    getSessionId: () => session.sessionId,
    subscribe: (listener) => session.subscribe(listener),
    prompt: (text, promptOptions) => session.prompt(text, promptOptions),
    abort: () => session.abort(),
  };
}

export class PiChatSession extends BaseTurnQueueChatSession<QueuedTurn> {
  private readonly config: PiChatSessionConfig;
  private readonly systemPrompt: string;
  private readonly createSessionFn: CreatePiSessionFn;
  private sessionHandle: PiSessionHandle | null = null;
  private unsubscribe: (() => void) | null = null;
  /** True while an in-flight `abort()` is settling the current turn, so the `executeTurn` catch does not treat a user-initiated interrupt as a session error. */
  private interrupting = false;
  private latestUsage: PiUsageLike | undefined;

  constructor(config: PiChatSessionConfig) {
    super(config.onMessage, config.onSessionEnd);
    this.config = config;
    this.systemPrompt = buildPiSystemPrompt(config.context);
    this.createSessionFn = config.createSession ?? createRealPiSession;
  }

  async start(initialMessage: string | ContentBlockParam[]): Promise<void> {
    if (this.active) {
      throw new Error('Session already started');
    }
    const turn = typeof initialMessage === 'string'
      ? { text: initialMessage, images: [] }
      : contentBlocksToPiPrompt(initialMessage);

    const { tools, toolNames } = this.config.kpmTools ?? buildPiKpmTools({
      focus: Boolean(this.config.context.focusDocument),
      projectId: this.config.context.project.id,
      chatSessionId: this.config.chatSessionId,
    });

    try {
      this.sessionHandle = await this.createSessionFn({
        cwd: this.resolveCwd(),
        systemPrompt: this.systemPrompt,
        tools,
        toolNames,
        model: this.config.model,
        resumeSessionId: this.config.resumeSessionId,
      });
    } catch (error) {
      this.config.onSessionEnd?.('error', error as Error);
      throw error;
    }

    this.unsubscribe = this.sessionHandle.subscribe((event) => this.handleEvent(event));
    this.active = true;
    this.ready = true;
    this.config.onReady?.(this.sessionHandle.getSessionId());

    this.turnPromise = this.runTurnAndDrain(turn);
  }

  send(text: string): void {
    this.enqueue({ text, images: [] });
  }

  sendUserContent(content: ContentBlockParam[]): void {
    this.enqueue(contentBlocksToPiPrompt(content));
  }

  interrupt(): Promise<void> {
    this.interrupting = true;
    return this.sessionHandle?.abort() ?? Promise.resolve();
  }

  getSessionId(): string | null {
    return this.sessionHandle?.getSessionId() ?? null;
  }

  protected async abortActiveTurn(): Promise<void> {
    try {
      await this.sessionHandle?.abort();
    } catch {
      // Ignore errors aborting during close.
    }
  }

  protected disposeAfterClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * pi's built-in `read`/`grep`/`find`/`ls` tools (and `createAgentSession`
   * itself) each bind to a single `cwd` string — the pi SDK has no
   * multi-directory equivalent of Claude Code's `--add-dir`, so only the
   * first connected repo is reachable through pi's native tools. Cross-repo
   * reads (P3) still work through KPM's own `git_read` custom tool, which
   * takes a `repoPath` and runs read-only git against any connected repo.
   */
  private resolveCwd(): string {
    const repo = this.config.context.repos[0];
    return repo ? resolveEffectiveRepoPath(repo) : this.config.context.project.folder_path;
  }

  protected async executeTurn(turn: QueuedTurn): Promise<void> {
    // Reset per-turn state. `interrupting` also guards against a leaked flag
    // from an interrupt() call that had no in-flight turn to consume it.
    this.interrupting = false;
    this.latestUsage = undefined;
    try {
      if (!this.sessionHandle) {
        throw new Error('pi session is not initialized');
      }
      await this.sessionHandle.prompt(turn.text, turn.images.length > 0 ? { images: turn.images } : undefined);
    } catch (error) {
      if (this.closing || this.interrupting) return;
      this.config.onSessionEnd?.('error', error as Error);
    } finally {
      this.interrupting = false;
    }
  }

  private handleEvent(event: unknown): void {
    const typed = event as { type?: unknown };
    switch (typed.type) {
      case 'message_update':
        this.handleMessageUpdate(event as { assistantMessageEvent?: { type?: unknown; delta?: unknown } });
        return;
      case 'message_end':
        this.handleMessageEnd(event as { message?: unknown });
        return;
      case 'turn_end':
        this.handleTurnEnd(event as { message?: unknown });
        return;
      case 'tool_execution_start':
        this.handleToolExecutionStart(event as { toolCallId?: unknown; toolName?: unknown; args?: unknown });
        return;
      case 'agent_end':
        this.handleAgentEnd(event as { messages?: unknown[] });
        return;
      default:
        return;
    }
  }

  private handleMessageUpdate(event: { assistantMessageEvent?: { type?: unknown; delta?: unknown } }): void {
    if (!getConfig().claude.includePartialMessages) return;
    const delta = event.assistantMessageEvent;
    if (delta?.type !== 'text_delta' || typeof delta.delta !== 'string' || !delta.delta) return;
    this.config.onMessage({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: delta.delta } },
    });
  }

  private handleMessageEnd(event: { message?: unknown }): void {
    const message = asAssistantMessage(event.message);
    if (!message) return;

    this.latestUsage = message.usage ?? this.latestUsage;

    const thinkingText = message.content
      .filter((block): block is { type: 'thinking'; thinking: string } => block.type === 'thinking')
      .map((block) => block.thinking)
      .join('');
    if (thinkingText) {
      this.config.onMessage({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: thinkingText }] },
      });
    }

    const text = message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (text) {
      this.config.onMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text }] },
      });
    }

    if (message.stopReason === 'error' && message.errorMessage) {
      console.error('[PiChatSession] pi turn error:', message.errorMessage);
      this.config.onMessage({
        type: 'assistant',
        error: 'server_error',
        message: { content: [{ type: 'text', text: message.errorMessage }] },
      });
    }
  }

  /**
   * `turn_end.message` is the same finalized assistant message `message_end`
   * already read. pi-coding-agent's own compaction bookkeeping treats
   * `assistantMessage.usage` as possibly absent (guards it with `usage ? ...
   * : 0`), which happens for aborted/error turns — so this is a second
   * chance at the same field, merged rather than overwritten so a real usage
   * value already captured this turn is never clobbered by a later absent one.
   */
  private handleTurnEnd(event: { message?: unknown }): void {
    const usage = asAssistantMessage(event.message)?.usage;
    this.latestUsage = usage ?? this.latestUsage;
  }

  private handleToolExecutionStart(event: { toolCallId?: unknown; toolName?: unknown; args?: unknown }): void {
    if (typeof event.toolCallId !== 'string' || typeof event.toolName !== 'string') return;
    const input = event.args && typeof event.args === 'object' ? event.args as Record<string, unknown> : {};
    this.config.onMessage({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: event.toolCallId,
          name: event.toolName,
          input,
        }],
      },
    });
  }

  private handleAgentEnd(event: { messages?: unknown[] }): void {
    const usage = this.latestUsage ?? extractLastAssistantUsage(event.messages);
    this.config.onMessage({
      type: 'result',
      usage: usageToClaudeShape(usage),
      session_id: this.getSessionId(),
    });
  }
}
