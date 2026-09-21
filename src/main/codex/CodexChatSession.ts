import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodexAppServerClient, type CodexAppServerClientOptions } from './CodexAppServerClient';
import { registerCodexMcpSession, type CodexMcpRegistration } from './KpmCodexMcpServer';
import type { PlanContext } from '../chat/prompts';
import { buildChatSystemPrompt } from '../chat/prompts';
import { BaseTurnQueueChatSession, type SessionEndReason } from '../services/streaming/BaseTurnQueueChatSession';
import {
  assistantError,
  assistantText,
  assistantThinking,
  textDelta,
  toolUse,
  turnResult,
  type ProviderChatMessage,
} from '../services/streaming/providerChatMessage';
import { resolveEffectiveRepoPath } from '../../shared/repoPath';
import type { WriteDecision } from '../chat/writeGrants';
import { shellCommandNeedsWriteGrant } from '../chat/shellWritePolicy';
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

interface QueuedTurn { input: JsonObject[]; cleanup?: () => Promise<void>; }

async function contentToInput(content: string | ContentBlockParam[]): Promise<QueuedTurn> {
  if (typeof content === 'string') return { input: [{ type: 'text', text: content }] };
  const input: JsonObject[] = [];
  let attachmentDir: string | null = null;
  for (const [index, block] of content.entries()) {
    if (block.type === 'text') { input.push({ type: 'text', text: block.text }); continue; }
    if (block.type === 'image' && block.source.type === 'base64') {
      attachmentDir ??= await mkdtemp(join(tmpdir(), 'kpm-codex-'));
      const path = join(attachmentDir, `image-${index}${imageExtension(block.source.media_type)}`);
      await writeFile(path, Buffer.from(block.source.data, 'base64'));
      input.push({ type: 'localImage', path });
      continue;
    }
    input.push({ type: 'text', text: `[${block.type} attachment is not supported by Codex app-server.]` });
  }
  return { input, ...(attachmentDir ? { cleanup: () => rm(attachmentDir, { recursive: true, force: true }) } : {}) };
}
function imageExtension(mediaType: string): string { const subtype = mediaType.split('/')[1]; return subtype && /^[a-z0-9.+-]+$/i.test(subtype) ? `.${subtype}` : '.img'; }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(...values: unknown[]): number { const value = values.find((candidate) => typeof candidate === 'number'); return typeof value === 'number' ? value : 0; }

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
  private readonly mcpStartupStates = new Map<string, Pick<SessionMcpServer, 'status' | 'error'>>();
  private tokenUsage: JsonObject = {};
  private readonly attachmentCleanups = new Set<() => Promise<void>>();

  constructor(config: CodexChatSessionConfig) { super(config.onMessage, config.onSessionEnd); this.config = config; this.systemPrompt = buildChatSystemPrompt(config.context, { provider: 'codex', scope: config.context.focusDocument ? 'focus_document' : 'main' }); this.threadId = config.resumeThreadId ?? null; }

  async start(initialMessage: string | ContentBlockParam[]): Promise<void> {
    if (this.active) throw new Error('Session already started');
    this.mcpRegistration = await (this.config.registerMcpSession ?? (() => registerCodexMcpSession({ projectId: this.config.context.project.id, chatSessionId: this.config.chatSessionId, focus: Boolean(this.config.context.focusDocument) })))();
    try {
      this.client = (this.config.createAppServerClient ?? ((options) => new CodexAppServerClient(options)))({ env: { ...process.env, KPM_MCP_TOKEN: this.mcpRegistration.token } });
      this.client.onNotification((method, params) => this.handleNotification(method, params));
      this.client.setServerRequestHandler((method, params) => this.handleServerRequest(method, params));
      await this.client.initialize();
      const result = await this.client.request(this.threadId ? 'thread/resume' : 'thread/start', this.threadOptions(this.threadId));
      const thread = isObject(result) && isObject(result.thread) ? result.thread : null;
      const id = thread ? text(thread.id) : this.threadId;
      if (!id) throw new Error('Codex app-server did not return a thread id');
      this.threadId = id; this.active = true; this.ready = true; this.config.onReady?.(id);
      this.turnPromise = this.runTurnAndDrain(await this.prepareTurn(initialMessage));
    } catch (error) { this.disposeResources(); throw error; }
  }

  send(value: string): void { this.enqueue({ input: [{ type: 'text', text: value }] }); }
  async sendUserContent(content: ContentBlockParam[]): Promise<void> { this.enqueue(await this.prepareTurn(content)); }
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
      const result = await this.client.request('turn/start', { threadId: this.threadId, input: turn.input, cwd: this.config.context.project.folder_path, approvalPolicy: 'on-request', sandboxPolicy: this.sandboxPolicy(), ...(this.config.model ? { model: this.config.model } : {}), ...(this.config.modelReasoningEffort ? { effort: this.config.modelReasoningEffort } : {}) });
      if (isObject(result) && isObject(result.turn)) this.activeTurnId = text(result.turn.id) || null;
      await completed;
    } catch (error) {
      if (!this.closing) {
        this.disposeResources();
        this.config.onSessionEnd?.('error', error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      await turn.cleanup?.();
      if (turn.cleanup) this.attachmentCleanups.delete(turn.cleanup);
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
    if (method === 'thread/tokenUsage/updated') { const tokenUsage = isObject(params.tokenUsage) ? params.tokenUsage : {}; this.tokenUsage = isObject(tokenUsage.last) ? tokenUsage.last : {}; return; }
    if (method === 'turn/completed') { const usage = this.tokenUsage; const turn = isObject(params.turn) ? params.turn : {}; const turnError = isObject(turn.error) ? text(turn.error.message) : ''; if (text(turn.status) === 'failed' && turnError) this.config.onMessage(assistantError(turnError)); this.config.onMessage(turnResult({ usage: { input_tokens: number(usage.inputTokens, usage.input_tokens), output_tokens: number(usage.outputTokens, usage.output_tokens), cache_read_input_tokens: number(usage.cachedInputTokens, usage.cached_input_tokens), cache_creation_input_tokens: number(usage.cacheWriteInputTokens, usage.cache_write_input_tokens) }, sessionId: this.threadId ?? undefined })); this.finishTurn?.(); return; }
    // The app-server must die with the session: while it lives it holds the
    // thread's writer lock, and the next thread/resume is refused with
    // "already has an active writer".
    if (method === 'error') { const error = isObject(params.error) ? text(params.error.message) : text(params.error); this.disposeResources(); this.config.onSessionEnd?.('error', new Error(error || 'Codex app-server error')); this.finishTurn?.(); }
  }
  private handleItem(item: JsonObject, completed: boolean): void {
    const id = text(item.id); if (id) this.items.set(id, item); const type = text(item.type);
    if (type === 'agentMessage' && completed) { const message = text(item.text); if (message) this.config.onMessage(assistantText(message)); return; }
    if (type === 'reasoning') { const summary = Array.isArray(item.summary) ? item.summary.filter((value): value is string => typeof value === 'string').join('\n') : ''; if (summary) this.config.onMessage(assistantThinking(summary)); return; }
    if (!completed) this.emitToolUse(item);
    if (type === 'mcpToolCall' && completed && isObject(item.error)) this.config.onMessage(assistantError(text(item.error.message)));
  }
  private emitToolUse(item: JsonObject): void {
    const type = text(item.type); const name = type === 'commandExecution' ? 'Bash' : type === 'fileChange' ? 'apply_patch' : type === 'mcpToolCall' ? `mcp__${text(item.server)}__${text(item.tool)}` : type === 'webSearch' ? 'WebSearch' : null;
    if (!name) return;
    this.config.onMessage(toolUse(text(item.id), name, type === 'commandExecution' ? { command: item.command } : type === 'mcpToolCall' ? { arguments: item.arguments } : { changes: item.changes }));
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
  private async prepareTurn(content: string | ContentBlockParam[]): Promise<QueuedTurn> {
    const turn = await contentToInput(content);
    if (turn.cleanup) this.attachmentCleanups.add(turn.cleanup);
    return turn;
  }
  private disposeResources(): void {
    this.client?.close(); this.client = null; this.mcpRegistration?.dispose(); this.mcpRegistration = null;
    for (const cleanup of this.attachmentCleanups) void cleanup();
    this.attachmentCleanups.clear();
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
