import { readFile } from 'fs/promises';
import { CodexAppServerClient, type CodexAppServerClientOptions } from './CodexAppServerClient';
import { registerCodexMcpSession, type CodexMcpRegistration } from './KpmCodexMcpServer';
import { describeCodexTurnError } from './codexErrors';
import type { PlanContext } from '../chat/prompts';
import { buildChatSystemPrompt } from '../chat/prompts';
import { BaseTurnQueueChatSession, type SessionEndReason } from '../services/streaming/BaseTurnQueueChatSession';
import {
  providerError,
  providerNotice,
  assistantText,
  assistantThinking,
  textDelta,
  toolUse,
  turnResult,
  type ProviderChatMessage,
} from '../services/streaming/providerChatMessage';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';
import { readCodexTokenCounts, subtractCodexTokens, toKpmUsage, ZERO_CODEX_TOKENS, type CodexTokenCounts } from './codexUsage';
import type { WriteDecision } from '../chat/writeGrants';
import { shellCommandNeedsWriteGrant } from '../chat/shellWritePolicy';
import type { ChatAttachment } from '../../shared/types';
import type {
  SessionMcpAuthStatus,
  SessionMcpInspection,
  SessionMcpServer,
} from '../services/streaming/sessionMcp';

type JsonObject = Record<string, unknown>;

export interface CodexChatSessionConfig {
  context: PlanContext;
  chatSessionId?: string;
  resumeThreadId?: string;
  model?: string;
  modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  onMessage: (msg: ProviderChatMessage) => void;
  onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
  onReady?: (threadId: string) => void;
  registerMcpSession?: () => Promise<CodexMcpRegistration>;
  requestWriteConsent?: () => Promise<WriteDecision>;
  hasWriteAccess?: () => boolean;
  requestExternalApproval?: (toolName: string, input: JsonObject) => Promise<boolean>;
  onMcpElicitation?: (request: JsonObject) => Promise<{ action: 'accept' | 'decline' | 'cancel'; content?: JsonObject }>;
  createAppServerClient?: (options: CodexAppServerClientOptions) => CodexAppServerClient;
}

interface QueuedTurn { input: JsonObject[]; }

// Images go by path: the attachment already sits in KPM's temp directory, which
// app-server reads directly. Text files are inlined, since app-server has no
// file input. PDFs are refused before a send reaches here (`attachmentKinds`).
async function attachmentsToInput(text: string, attachments: ChatAttachment[]): Promise<QueuedTurn> {
  const input: JsonObject[] = [];
  for (const attachment of attachments) {
    if (attachment.kind === 'image') { input.push({ type: 'localImage', path: attachment.path }); continue; }
    if (attachment.kind === 'text') { input.push({ type: 'text', text: `<file name="${attachment.filename}">\n${await readFile(attachment.path, 'utf-8')}\n</file>` }); continue; }
    throw new Error(`Codex can't read "${attachment.filename}"`);
  }
  if (text.trim()) input.push({ type: 'text', text });
  return { input };
}
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function contextWindow(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** App-server chat adapter. Board execution intentionally stays on the SDK. */
export class CodexChatSession extends BaseTurnQueueChatSession<QueuedTurn> {
  private readonly config: CodexChatSessionConfig;
  private readonly systemPrompt: string;
  private client: CodexAppServerClient | null = null;
  private mcpRegistration: CodexMcpRegistration | null = null;
  private threadId: string | null;
  private activeTurnId: string | null = null;
  private finishTurn: (() => void) | null = null;
  private readonly items = new Map<string, JsonObject>();
  private readonly announcedSearches = new Set<string>();
  private readonly mcpStartupStates = new Map<string, Pick<SessionMcpServer, 'status' | 'error'>>();
  // Codex's `total` is thread-cumulative (resume included) and `last` is one
  // model request, so a turn's usage is the difference against the total from
  // before its first request.
  private turnUsageBaseline: CodexTokenCounts | null = null;
  private threadUsageTotal: CodexTokenCounts = ZERO_CODEX_TOKENS;
  private lastRequestUsage: CodexTokenCounts = ZERO_CODEX_TOKENS;
  private threadModel: string | undefined;
  private modelContextWindow: number | undefined;

  constructor(config: CodexChatSessionConfig) { super(config.onMessage, config.onSessionEnd); this.config = config; this.systemPrompt = buildChatSystemPrompt(config.context, { provider: 'codex', scope: config.context.focusDocument ? 'focus_document' : 'main' }); this.threadId = config.resumeThreadId ?? null; }

  async start(initialMessage: string, attachments: ChatAttachment[] = []): Promise<void> {
    if (this.active) throw new Error('Session already started');
    this.mcpRegistration = await (this.config.registerMcpSession ?? (() => registerCodexMcpSession({ projectId: this.config.context.project.id, chatSessionId: this.config.chatSessionId, focus: Boolean(this.config.context.focusDocument) })))();
    try {
      this.client = (this.config.createAppServerClient ?? ((options) => new CodexAppServerClient(options)))({ env: { ...process.env, KPM_MCP_TOKEN: this.mcpRegistration.token } });
      this.client.onNotification((method, params) => this.handleNotification(method, params));
      this.client.setServerRequestHandler((method, params) => this.handleServerRequest(method, params));
      await this.client.initialize();
      const result = await this.client.request(this.threadId ? 'thread/resume' : 'thread/start', this.threadOptions(this.threadId));
      const thread = isObject(result) && isObject(result.thread) ? result.thread : null;
      this.threadModel = (isObject(result) ? text(result.model) : '') || this.config.model;
      const id = thread ? text(thread.id) : this.threadId;
      if (!id) throw new Error('Codex app-server did not return a thread id');
      this.threadId = id; this.active = true; this.ready = true; this.config.onReady?.(id);
      this.turnPromise = this.runTurnAndDrain(await attachmentsToInput(initialMessage, attachments));
    } catch (error) { this.disposeResources(); throw error; }
  }

  send(value: string): void { this.enqueue({ input: [{ type: 'text', text: value }] }); }
  async sendWithAttachments(value: string, attachments: ChatAttachment[]): Promise<void> { this.enqueue(await attachmentsToInput(value, attachments)); }
  async interrupt(): Promise<void> { await this.abortActiveTurn(); }
  getSessionId(): string | null { return this.threadId; }

  mcp(): SessionMcpInspection {
    return {
      list: () => this.listMcpServers(),
      reload: () => this.reloadMcpServers(),
      beginLogin: (serverName: string) => this.loginMcpServer(serverName),
    };
  }
  private async listMcpServers(): Promise<SessionMcpServer[]> {
    if (!this.client || !this.threadId) return [];
    const result = await this.client.request('mcpServerStatus/list', { threadId: this.threadId, detail: 'toolsAndAuthOnly' });
    const data = isObject(result) && Array.isArray(result.data) ? result.data : [];
    return data.filter(isObject).map((status) => {
      const name = text(status.name);
      const startup = this.mcpStartupStates.get(name);
      const error = startup?.error ?? (typeof status.error === 'string' ? status.error : undefined);
      return {
        name,
        status: startup?.status ?? (error ? 'failed' : 'connected'),
        authStatus: codexMcpAuthStatus(status.authStatus),
        ...(error ? { error } : {}),
      };
    });
  }
  private async reloadMcpServers(): Promise<void> { if (this.client) await this.client.request('config/mcpServer/reload'); }
  private async loginMcpServer(name: string): Promise<string> {
    if (!this.client || !this.threadId) throw new Error('Codex chat is not connected');
    const result = await this.client.request('mcpServer/oauth/login', { name, threadId: this.threadId });
    const authorizationUrl = isObject(result) ? text(result.authorizationUrl) : '';
    if (!authorizationUrl) throw new Error(`Codex did not provide an authorization URL for ${name}`);
    return authorizationUrl;
  }
  protected async abortActiveTurn(): Promise<void> { if (!this.client || !this.threadId || !this.activeTurnId) return; try { await this.client.request('turn/interrupt', { threadId: this.threadId, turnId: this.activeTurnId }); } catch { /* exit settles the turn */ } }
  protected disposeAfterClose(): void { this.disposeResources(); }

  protected async executeTurn(turn: QueuedTurn): Promise<void> {
    if (!this.client || !this.threadId) throw new Error('Codex app-server is not initialized');
    try {
      const completed = new Promise<void>((resolve) => { this.finishTurn = resolve; });
      this.turnUsageBaseline = null; this.lastRequestUsage = ZERO_CODEX_TOKENS;
      const result = await this.client.request('turn/start', { threadId: this.threadId, input: turn.input, cwd: this.config.context.project.folder_path, approvalPolicy: 'on-request', sandboxPolicy: this.sandboxPolicy(), ...(this.config.model ? { model: this.config.model } : {}), ...(this.config.modelReasoningEffort ? { effort: this.config.modelReasoningEffort } : {}) });
      if (isObject(result) && isObject(result.turn)) this.activeTurnId = text(result.turn.id) || null;
      await completed;
    } catch (error) {
      if (!this.closing) {
        this.disposeResources();
        this.config.onSessionEnd?.('error', error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.finishTurn = null;
      this.activeTurnId = null;
    }
  }

  private threadOptions(threadId: string | null): JsonObject {
    const config: JsonObject = {
      developer_instructions: this.systemPrompt,
      web_search: 'live',
      mcp_servers: {
        kpm: { url: this.mcpRegistration?.url, bearer_token_env_var: 'KPM_MCP_TOKEN', required: true, tool_timeout_sec: 60, default_tools_approval_mode: 'approve' },
        // KPM uses explicit, scoped integrations such as Playwright rather than
        // granting an agent general control over the user's desktop.
        'computer-use': { enabled: false },
      },
    };
    return { ...(threadId ? { threadId } : {}), ...(this.config.model ? { model: this.config.model } : {}), cwd: this.config.context.project.folder_path, approvalPolicy: 'on-request', sandbox: this.config.hasWriteAccess?.() ? 'workspace-write' : 'read-only', config, developerInstructions: this.systemPrompt };
  }
  private sandboxPolicy(): JsonObject {
    if (!this.config.hasWriteAccess?.()) return { type: 'readOnly' };
    const writableRoots = Array.from(new Set([this.config.context.project.folder_path, ...this.config.context.repos.map(resolveEffectiveRepoPath).filter((path): path is string => Boolean(path))]));
    return { type: 'workspaceWrite', writableRoots, networkAccess: false };
  }

  private handleNotification(method: string, params: JsonObject): void {
    if (method === 'thread/started') { const thread = isObject(params.thread) ? params.thread : null; const id = thread ? text(thread.id) : ''; if (id && id !== this.threadId) { this.threadId = id; this.config.onReady?.(id); } return; }
    if (method === 'item/started' || method === 'item/completed') { const item = isObject(params.item) ? params.item : null; if (item) this.handleItem(item, method === 'item/completed'); return; }
    if (method === 'item/agentMessage/delta') { const delta = text(params.delta); if (delta) this.config.onMessage(textDelta(delta)); return; }
    if (method === 'item/mcpToolCall/progress') { const item = this.items.get(text(params.itemId)); if (item) this.emitToolUse(item); return; }
    if (method === 'mcpServer/startupStatus/updated') {
      const status = text(params.status);
      const error = text(params.error) || undefined;
      this.mcpStartupStates.set(text(params.name), {
        status: status === 'ready' ? 'connected' : status === 'failed' ? 'failed' : 'pending',
        ...(error ? { error } : {}),
      });
      return;
    }
    if (method === 'thread/tokenUsage/updated') { this.recordTokenUsage(isObject(params.tokenUsage) ? params.tokenUsage : {}); return; }
    if (method === 'turn/completed') { const turn = isObject(params.turn) ? params.turn : {}; if (text(turn.status) === 'failed' && isObject(turn.error)) this.config.onMessage(providerError(describeCodexTurnError(turn.error))); this.config.onMessage(this.buildTurnResult()); this.finishTurn?.(); return; }
    // The app-server must die with the session: while it lives it holds the
    // thread's writer lock, and the next thread/resume is refused with
    // "already has an active writer".
    // `willRetry` means Codex is retrying the request itself and the turn goes
    // on; tearing down then would kill a turn that was about to recover.
    if (method === 'error') {
      if (params.willRetry === true) { const detail = isObject(params.error) ? text(params.error.message) : text(params.error); this.config.onMessage(providerNotice('Retrying', detail ? `Codex hit an error and is retrying: ${detail}` : 'Codex hit an error and is retrying')); return; }
      this.disposeResources(); this.config.onSessionEnd?.('error', new Error(describeCodexTurnError(params.error))); this.finishTurn?.();
    }
  }
  private recordTokenUsage(tokenUsage: JsonObject): void {
    const total = readCodexTokenCounts(tokenUsage.total);
    const last = readCodexTokenCounts(tokenUsage.last);
    this.turnUsageBaseline ??= subtractCodexTokens(total, last);
    this.threadUsageTotal = total;
    this.lastRequestUsage = last;
    this.modelContextWindow = contextWindow(tokenUsage.modelContextWindow);
  }
  private buildTurnResult(): ProviderChatMessage {
    const turnUsage = this.turnUsageBaseline ? subtractCodexTokens(this.threadUsageTotal, this.turnUsageBaseline) : ZERO_CODEX_TOKENS;
    return turnResult({
      usage: toKpmUsage(turnUsage),
      contextUsage: toKpmUsage(this.lastRequestUsage),
      contextWindow: this.modelContextWindow,
      model: this.threadModel,
      costUnknown: true,
      sessionId: this.threadId ?? undefined,
    });
  }
  private handleItem(item: JsonObject, completed: boolean): void {
    const id = text(item.id); if (id) this.items.set(id, item); const type = text(item.type);
    if (type === 'agentMessage' && completed) { const message = text(item.text); if (message) this.config.onMessage(assistantText(message)); return; }
    if (type === 'reasoning') { const summary = Array.isArray(item.summary) ? item.summary.filter((value): value is string => typeof value === 'string').join('\n') : ''; if (summary) this.config.onMessage(assistantThinking(summary)); return; }
    // A search's query can arrive only on completion, so it is announced once it has one.
    if (!completed || (type === 'webSearch' && !this.announcedSearches.has(id))) this.emitToolUse(item);
    // A failed tool call goes back to the model, which usually carries on, so it
    // is a note on the turn, not a turn error.
    if (type === 'mcpToolCall' && completed && isObject(item.error)) { const message = text(item.error.message); this.config.onMessage(providerNotice('Tool failed', `${text(item.server)}/${text(item.tool)}${message ? `: ${message}` : ''}`)); }
  }
  private emitToolUse(item: JsonObject): void {
    const calls = codexToolCalls(item);
    if (text(item.type) === 'webSearch' && calls.length > 0) this.announcedSearches.add(text(item.id));
    for (const call of calls) this.config.onMessage(toolUse(call.id, call.name, call.input));
  }

  private async handleServerRequest(method: string, params: JsonObject): Promise<unknown> {
    if (method === 'item/commandExecution/requestApproval') return { decision: !shellCommandNeedsWriteGrant(text(params.command)) || await this.allowWrite() ? 'accept' : 'decline' };
    if (method === 'item/fileChange/requestApproval') return { decision: await this.allowWrite() ? 'accept' : 'decline' };
    if (method === 'item/permissions/requestApproval') { const permissions = isObject(params.permissions) ? params.permissions : {}; const needsWrite = isObject(permissions.fileSystem) && Object.keys(permissions.fileSystem).length > 0; const allowed = needsWrite ? await this.allowWrite() : await this.requestExternalApproval('Codex permission', { reason: params.reason, permissions }); return { permissions: allowed ? permissions : {}, scope: 'turn' }; }
    if (method === 'mcpServer/elicitation/request') return this.config.onMcpElicitation?.(params) ?? { action: 'decline', content: null };
    if (method === 'item/tool/requestUserInput') { const item = this.items.get(text(params.itemId)); const isPlaywright = text(item?.server).toLowerCase() === 'playwright'; const allowed = isPlaywright || await this.requestExternalApproval('MCP browser action', { questions: params.questions, item }); return { answers: allowed ? firstAnswers(params.questions) : {} }; }
    return {};
  }
  private async allowWrite(): Promise<boolean> { if (this.config.hasWriteAccess?.()) return true; return (await this.config.requestWriteConsent?.())?.allowed === true; }
  private async requestExternalApproval(toolName: string, input: JsonObject): Promise<boolean> { return this.config.requestExternalApproval ? this.config.requestExternalApproval(toolName, input) : false; }
  private disposeResources(): void {
    this.client?.close(); this.client = null; this.mcpRegistration?.dispose(); this.mcpRegistration = null;
  }
}

interface CanonicalToolCall { id: string; name: string; input: JsonObject; }

/**
 * A Codex item as the tool call KPM's shared activity and tool-log code reads,
 * which speaks Claude's tool names and input shapes. Display only: Codex's own
 * approval requests, not these names, decide what may run.
 */
export function codexToolCalls(item: JsonObject): CanonicalToolCall[] {
  const id = text(item.id);
  switch (text(item.type)) {
    case 'commandExecution':
      return [{ id, name: 'Bash', input: { command: text(item.command) } }];
    case 'fileChange': {
      // One card per file, so each changed path is shown and logged.
      const changes = Array.isArray(item.changes) ? item.changes.filter(isObject).filter((change) => text(change.path)) : [];
      if (changes.length === 0) return [{ id, name: 'apply_patch', input: {} }];
      return changes.map((change, index) => ({
        id: index === 0 ? id : `${id}:${index}`,
        name: isObject(change.kind) && change.kind.type === 'add' ? 'Write' : 'Edit',
        input: { file_path: text(change.path) },
      }));
    }
    case 'mcpToolCall':
      return [{ id, name: `mcp__${text(item.server)}__${text(item.tool)}`, input: isObject(item.arguments) ? item.arguments : {} }];
    case 'webSearch': {
      const action = isObject(item.action) ? item.action : {};
      const queries = Array.isArray(action.queries) ? action.queries.filter((query): query is string => typeof query === 'string') : [];
      const query = text(item.query) || text(action.query) || queries[0] || text(action.url);
      return query ? [{ id, name: 'WebSearch', input: { query } }] : [];
    }
    default:
      return [];
  }
}

function firstAnswers(value: unknown): JsonObject {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.filter(isObject).map((question) => { const options = Array.isArray(question.options) ? question.options : []; return [text(question.id), { answers: options.length > 0 && isObject(options[0]) ? [text(options[0].label)] : [] }]; }));
}

function codexMcpAuthStatus(value: unknown): SessionMcpAuthStatus {
  return value === 'unsupported' || value === 'notLoggedIn' || value === 'bearerToken' || value === 'oAuth'
    ? value
    : 'unknown';
}
