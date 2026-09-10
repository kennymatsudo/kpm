import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import type * as PiCodingAgent from '@earendil-works/pi-coding-agent';
import type { ToolDefinition as PiSdkToolDefinition } from '@earendil-works/pi-coding-agent';
import { BaseTurnQueueChatSession, type SessionEndReason } from '../services/streaming/BaseTurnQueueChatSession';
import { getConfig } from '../config';
import { buildPiKpmTools, type PiKpmToolDefinition, type PiToolImageContent } from './kpmToolAdapter';
import type { PlanContext } from '../chat/prompts';
import { buildUserGlobalInstructionsSection, buildPlanReferenceRulesSection } from '../chat/prompts';
import { buildItemReferenceTable } from '../chat/prompts/planFormatting';
import { buildPlanModificationsSection } from '../chat/prompts/modes';
import { resolveRegistryPrompt } from '../chat/prompts/promptRegistry';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';
import { shellCommandNeedsWriteGrant } from '../chat/shellWritePolicy';
import {
  pathCanTraverseDeniedRoot,
  pathResolvesIntoDeniedRoot,
} from '../services/files/pathSecurity';

/** Built-in pi tools that are read-only against the filesystem. */
const READ_ONLY_BUILTIN_TOOLS = ['read', 'grep', 'find', 'ls'] as const;

const WRITE_BUILTIN_TOOLS = ['write', 'edit', 'bash'] as const;

/**
 * The `pi-mcp-adapter` gateway, which is how a pi session reaches the user's
 * MCP servers.
 *
 * One name covers every server: the adapter registers a single `mcp` proxy
 * tool that lists, searches, and invokes each server's tools, so KPM never has
 * to predict tool names that only exist once a server connects. If the adapter
 * isn't installed, nothing registers under this name and allowing it is inert.
 *
 * Which servers exist, and which are switched off, stays in the user's own
 * `~/.pi/agent/mcp.json` — the same place their `pi` CLI reads, and where a
 * server already takes `disabled: true`. Servers keep pi's default `lazy`
 * lifecycle, so none connect until the model asks for one.
 *
 * These calls leave the machine for an external service instead of touching
 * the repo, so they sit outside the write grant (P7), matching how the user's
 * MCP servers already behave in Claude chat. The same caveat carries over
 * too: an MCP server can write to a tracker without passing through KPM's
 * export boundary (P6).
 */
const MCP_GATEWAY_TOOLS = ['mcp'] as const;

export type PiWriteConsentFn = () => Promise<
  { allowed: true } | { allowed: false; reason: string }
>;

/**
 * The directory a pi session runs in: the first connected repo's working tree,
 * falling back to the project folder.
 */
export function resolvePiCwd(context: PlanContext): string {
  const repo = context.repos[0];
  return repo ? resolveEffectiveRepoPath(repo) : context.project.folder_path;
}

interface PiUsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost?: { total?: number };
}

interface PiSessionStatsLike {
  tokens: PiUsageLike;
  cost: number;
}

/** Structurally compatible with pi's real `AgentSession` — narrowed to what PiChatSession needs. */
export interface PiSessionHandle {
  getSessionId: () => string;
  subscribe: (listener: (event: unknown) => void) => () => void;
  prompt: (text: string, options?: { images?: PiToolImageContent[] }) => Promise<void>;
  abort: () => Promise<void>;
  /** Added in the current SDK path so KPM can include tool/compaction usage. */
  getSessionStats?: () => PiSessionStatsLike;
  dispose?: () => void;
}

export interface CreatePiSessionOptions {
  cwd: string;
  systemPrompt: string;
  tools: PiKpmToolDefinition[];
  toolNames: string[];
  /** `"<provider>/<modelId>"` selection resolved via the pi SDK's ModelRuntime after session creation. */
  model?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** pi's own persisted session id to continue. Unset starts a fresh persisted session. */
  resumeSessionId?: string;
  /** Gates write builtins on the conversation's write consent. Omitted means no writes. */
  requestWriteConsent?: PiWriteConsentFn;
}

export type CreatePiSessionFn = (options: CreatePiSessionOptions) => Promise<PiSessionHandle>;

export interface PiChatSessionConfig {
  context: PlanContext;
  chatSessionId?: string;
  resumeSessionId?: string;
  /** `"<provider>/<modelId>"` selection. */
  model?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  onMessage: (msg: unknown) => void;
  onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
  onReady?: (sessionId: string) => void;
  /** KPM tools adapted by the caller for this session. Defaults to building from context for tests/backcompat. */
  kpmTools?: { tools: PiKpmToolDefinition[]; toolNames: string[] };
  /** Gates write builtins on the conversation's write consent. Omitted means no writes. */
  requestWriteConsent?: PiWriteConsentFn;
  /** Injectable session factory, defaulting to the real pi SDK. Tests inject a fake to avoid live model calls. */
  createSession?: CreatePiSessionFn;
}

interface QueuedTurn {
  text: string;
  images: PiToolImageContent[];
}

/**
 * Tool-call gate. Blocks anything outside the allowlist, and routes a write
 * builtin through the conversation's write consent (P7).
 *
 * Exported standalone so it is unit-testable without the real pi extension
 * runtime; `createRealPiSession` wires the same function into
 * `pi.on('tool_call', ...)`. pi awaits the handler and fails closed if it
 * throws, so a consent prompt that never resolves blocks rather than leaks.
 */
export function buildToolCallGate(
  allowedToolNames: readonly string[],
  requestWriteConsent?: PiWriteConsentFn,
  pathIsProtected: (
    path: string,
    traversal: boolean,
  ) => Promise<boolean> = (path, traversal) => (
    traversal
      ? pathCanTraverseDeniedRoot(path)
      : pathResolvesIntoDeniedRoot(path)
  ),
): (event: { toolName: string; input?: Record<string, unknown> }) => Promise<{ block: true; reason: string } | undefined> {
  const allowed = new Set(allowedToolNames);
  return async ({ toolName, input }) => {
    if (!allowed.has(toolName)) {
      return { block: true, reason: `Tool "${toolName}" is not available in this chat session.` };
    }

    const protectsFilesystem = ['read', 'write', 'edit', 'ls', 'grep', 'find'].includes(toolName);
    const targetPath = typeof input?.path === 'string'
      ? input.path
      : protectsFilesystem
        ? '.'
        : undefined;
    if (
      targetPath
      && await pathIsProtected(targetPath, toolName === 'grep' || toolName === 'find')
    ) {
      return { block: true, reason: `Tool "${toolName}" cannot access protected credential paths.` };
    }

    if (!(WRITE_BUILTIN_TOOLS as readonly string[]).includes(toolName)) return undefined;

    // Reading git state is a read: `git status`/`diff`/`log` run without the
    // write grant, on the same rule Claude's gate applies.
    if (
      toolName === 'bash'
      && typeof input?.command === 'string'
      && !shellCommandNeedsWriteGrant(input.command)
    ) {
      return undefined;
    }

    if (!requestWriteConsent) {
      return { block: true, reason: `Tool "${toolName}" cannot change files in this chat session.` };
    }

    const decision = await requestWriteConsent();
    return decision.allowed ? undefined : { block: true, reason: decision.reason };
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

/** Structurally compatible with pi's real `ModelRuntime` — narrowed to what model selection needs. */
export interface PiModelRuntimeHandle<TModel extends { provider: string; id: string }> {
  getModel: (provider: string, modelId: string) => TModel | undefined;
  getAvailable: () => Promise<readonly TModel[]>;
}

export interface PiModelSelectionResult<TModel> {
  model: TModel;
  /** True when the exact `provider/modelId` selector missed and this is a same-provider substitute. */
  usedFallback: boolean;
}

/**
 * Resolve a parsed `{ provider, modelId }` selector against a live `ModelRuntime`.
 *
 * Exact means exact: a stale or guessed catalog entry returns undefined and the
 * KPM Chat turn fails rather than silently using a different registered model.
 */
export function resolvePiModelSelection<TModel extends { provider: string; id: string }>(
  modelRuntime: PiModelRuntimeHandle<TModel>,
  selector: { provider: string; modelId: string },
): Promise<PiModelSelectionResult<TModel> | undefined> {
  const exact = modelRuntime.getModel(selector.provider, selector.modelId);
  return Promise.resolve(exact ? { model: exact, usedFallback: false } : undefined);
}

export function buildPiSystemPrompt(context: PlanContext): string {
  const hasRepos = context.repos.length > 0;
  const repos = hasRepos
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

  const isFocus = Boolean(context.focusDocument);
  const operatingRules = isFocus
    ? `# Operating Rules
- This session is focused on one document. Direct file, shell, and git writes need the project's write grant; project files change through KPM's proposal tools.
- Jira, Linear, Confluence, and GitHub exports must not leak KPM-local fields or @plan internals.
- Plan data lives in KPM SQLite, not in connected repos.
- If the user asks to change the plan, use KPM plan tools so changes flow through KPM's proposal and review path.
- For document, project-context, move, or delete requests, use KPM proposal tools rather than editing files directly.
- Keep replies concise and utilitarian.`
    : [
        resolveRegistryPrompt('system.grounding', context.getPromptContent),
        resolveRegistryPrompt('system.constraints', context.getPromptContent),
        buildPlanModificationsSection(),
        resolveRegistryPrompt('system.workspace', context.getPromptContent),
        resolveRegistryPrompt('system.plan_rules', context.getPromptContent),
        resolveRegistryPrompt('system.response_style', context.getPromptContent),
      ].join('\n\n');
  const planRefs = isFocus
    ? `## Plan References
Use \`@plan/<uuid>\` when referring to plan items in markdown. Only use UUIDs listed in the current plan above.`
    : buildPlanReferenceRulesSection();

  return `You are pi running inside KPM's main chat. Help the user understand codebases, plan work, and reason across connected repos.

${operatingRules}

# Project
Name: ${context.project.name}
ID: \`${context.project.id}\`
Project folder: \`${context.project.folder_path}\`

Connected repos:
${repos}
${continuation}${focusDocument}${projectContext}${userPrefs}
# Current Plan
${context.planItems.length} items.
${planSummary}

${planRefs}`;
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

function sessionStatsDelta(before: PiSessionStatsLike, after: PiSessionStatsLike): PiUsageLike {
  return {
    input: Math.max(0, after.tokens.input - before.tokens.input),
    output: Math.max(0, after.tokens.output - before.tokens.output),
    cacheRead: Math.max(0, after.tokens.cacheRead - before.tokens.cacheRead),
    cacheWrite: Math.max(0, after.tokens.cacheWrite - before.tokens.cacheWrite),
    cost: { total: Math.max(0, after.cost - before.cost) },
  };
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
 * A `SettingsManager` that reads the user's pi settings but never writes them.
 *
 * `createAgentSession` defaults to `SettingsManager.create(cwd, agentDir)`,
 * which is backed by `~/.pi/agent/settings.json`. That is a write-through
 * handle: `AgentSession.setModel` calls `setDefaultModelAndProvider`, and
 * `setThinkingLevel` calls `setDefaultThinkingLevel`, both of which `save()`.
 * Since KPM sets a model on every session it starts, the default would make
 * opening a KPM chat or running a board agent silently rewrite the default
 * model and thinking level of the user's own `pi` CLI.
 *
 * Seeding the in-memory manager with the on-disk global settings keeps every
 * read intact — compaction, retry, image, and transport preferences, plus the
 * user's default thinking level, which `createAgentSession` falls back to when
 * KPM passes none — while redirecting writes to memory, where they die with the
 * session. Only global scope is seeded because KPM always denies project trust
 * (`resolvePiProjectTrust`), so project-scoped settings are never read anyway.
 */
export function createEphemeralPiSettings(pi: typeof PiCodingAgent, cwd: string): PiCodingAgent.SettingsManager {
  return pi.SettingsManager.inMemory(pi.SettingsManager.create(cwd, pi.getAgentDir()).getGlobalSettings());
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
  const allowedToolNames = [
    ...READ_ONLY_BUILTIN_TOOLS,
    ...(options.requestWriteConsent ? WRITE_BUILTIN_TOOLS : []),
    ...MCP_GATEWAY_TOOLS,
    ...options.toolNames,
  ];
  const gate = buildToolCallGate(
    allowedToolNames,
    options.requestWriteConsent,
    (candidatePath, traversal) => (
      traversal
        ? pathCanTraverseDeniedRoot(candidatePath, options.cwd)
        : pathResolvesIntoDeniedRoot(candidatePath, options.cwd)
    ),
  );
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
        extensionApi.on('tool_call', (event) => gate({ toolName: event.toolName, input: event.input }));
      },
    ],
  });
  await resourceLoader.reload({ resolveProjectTrust: resolvePiProjectTrust });

  const { session } = await pi.createAgentSession({
    cwd: options.cwd,
    sessionManager: await resolvePiSessionManager(pi, options.cwd, options.resumeSessionId),
    settingsManager: createEphemeralPiSettings(pi, options.cwd),
    tools: allowedToolNames,
    customTools: options.tools as unknown as PiSdkToolDefinition[],
    resourceLoader,
    ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
  });

  if (options.model) {
    const selector = parsePiModelSelector(options.model);
    const resolution = selector ? await resolvePiModelSelection(session.modelRuntime, selector) : undefined;
    if (!selector) throw new Error(`Invalid pi model selector “${options.model}”. Choose a provider/model pair.`);
    if (!resolution) throw new Error(`The saved pi model “${options.model}” is unavailable. Choose another model.`);
    await session.setModel(resolution.model);
  }

  // Extensions initialize on the `session_start` event, and `bindExtensions`
  // is the only thing that emits it — pi's own CLI modes call it, and a host
  // that skips it gets extensions that loaded but never started. Without it
  // every `mcp` call answers "MCP not initialized", and `pi-cursor-sdk` never
  // learns the session's cwd or id, so it pools its Cursor agents under one
  // anonymous scope shared with every other KPM pi session.
  //
  // Bound after the model so extensions see the model this session will run.
  // No UI context is passed, which keeps `ctx.hasUI` false and extensions on
  // their non-interactive paths — KPM has no renderer for a pi extension's
  // prompts.
  await session.bindExtensions({
    mode: 'print',
    onError: (error) => {
      console.warn(`[PiChatSession] pi extension "${error.extensionPath}" failed on ${error.event}: ${error.error}`);
    },
  });

  return {
    getSessionId: () => session.sessionId,
    subscribe: (listener) => session.subscribe(listener),
    prompt: (text, promptOptions) => session.prompt(text, promptOptions),
    abort: () => session.abort(),
    getSessionStats: () => session.getSessionStats(),
    // pi's own hosts emit `session_shutdown` before `dispose()`, and `dispose()`
    // alone does not: it invalidates the extension context without ever running
    // the handlers that release extension-owned resources, so a closed chat
    // would leave its MCP server connections and their subprocesses alive for
    // the life of the app. Not awaited — closing a chat should not wait on an
    // MCP server that is slow to stop.
    dispose: () => {
      void session.extensionRunner
        .emit({ type: 'session_shutdown', reason: 'quit' })
        .catch((error: unknown) => {
          console.warn(`[PiChatSession] pi extension shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => session.dispose());
    },
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
        thinkingLevel: this.config.thinkingLevel,
        resumeSessionId: this.config.resumeSessionId,
        requestWriteConsent: this.config.requestWriteConsent,
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
    this.sessionHandle?.dispose?.();
    this.sessionHandle = null;
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
    return resolvePiCwd(this.config.context);
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
      const before = this.sessionHandle.getSessionStats?.();
      await this.sessionHandle.prompt(turn.text, turn.images.length > 0 ? { images: turn.images } : undefined);
      const after = this.sessionHandle.getSessionStats?.();
      if (before && after) this.latestUsage = sessionStatsDelta(before, after);
      this.emitTurnResult();
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
    this.latestUsage = extractLastAssistantUsage(event.messages) ?? this.latestUsage;
  }

  private emitTurnResult(): void {
    const totalCostUsd = this.latestUsage?.cost?.total;
    this.config.onMessage({
      type: 'result',
      usage: usageToClaudeShape(this.latestUsage),
      ...(typeof totalCostUsd === 'number' ? { total_cost_usd: totalCostUsd } : {}),
      session_id: this.getSessionId(),
    });
  }
}
