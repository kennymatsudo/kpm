import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodexChatSession, codexSandboxPolicy, codexToolCalls } from './CodexChatSession';
import { getToolActivity } from '../claude/activity';
import { extractFilePaths } from '../services/toollog/extractFilePaths';
import type { CodexAppServerClient } from './CodexAppServerClient';
import type { PlanContext } from '../chat/prompts';
import type { ProviderChatMessage } from '../services/streaming/providerChatMessage';

type Handler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

class FakeAppServer {
  readonly requests: { method: string; params: Record<string, unknown> }[] = [];
  completeTurns = true;
  mcpServers: Record<string, unknown>[] = [];
  userConfig: Record<string, unknown> = {};
  private notification: ((method: string, params: Record<string, unknown>) => void) | null = null;
  private serverRequest: Handler | null = null;
  async initialize(): Promise<void> {}
  onNotification(handler: (method: string, params: Record<string, unknown>) => void): () => void { this.notification = handler; return () => { this.notification = null; }; }
  setServerRequestHandler(handler: Handler): void { this.serverRequest = handler; }
  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === 'config/read') return { config: this.userConfig, origins: {}, layers: null };
    if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: 'thread-1' } };
    if (method === 'mcpServerStatus/list') return { data: this.mcpServers };
    if (method === 'mcpServer/oauth/login') return { authorizationUrl: 'https://linear.app/oauth/authorize' };
    if (method === 'turn/start') {
      if (!this.completeTurns) return { turn: { id: 'turn-1' } };
      queueMicrotask(() => {
        this.emit('thread/tokenUsage/updated', {
          threadId: 'thread-1',
          turnId: 'turn-1',
          tokenUsage: { last: { inputTokens: 2, outputTokens: 3, cachedInputTokens: 1 }, total: {}, modelContextWindow: 1_050_000 },
        });
        this.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', usage: { inputTokens: 2, outputTokens: 3, cachedInputTokens: 1 } } });
      });
      return { turn: { id: 'turn-1' } };
    }
    return {};
  }
  closed = false;
  close(): void { this.closed = true; }
  sent(method: string): { method: string; params: Record<string, unknown> }[] { return this.requests.filter((request) => request.method === method); }
  emit(method: string, params: Record<string, unknown>): void { this.notification?.(method, params); }
  ask(method: string, params: Record<string, unknown>): Promise<unknown> { return this.serverRequest?.(method, params) ?? Promise.resolve({}); }
}

function context(): PlanContext {
  return { project: { id: 'project-1', name: 'Project', phase: 'discovery', folder_path: '/tmp/project', created_at: '2026-01-01T00:00:00.000Z', session_tokens: 0, session_input_tokens: 0, session_output_tokens: 0 }, repos: [], attachments: [], planItems: [], focusedResources: [] };
}

function sentMessages(onMessage: ReturnType<typeof vi.fn>): ProviderChatMessage[] {
  return onMessage.mock.calls.map(([msg]) => msg as ProviderChatMessage);
}

function registration() { return { url: 'http://127.0.0.1:1234/mcp/kpm', token: 'token', dispose: vi.fn() }; }

describe('CodexChatSession', () => {
  it('starts through app-server, streams items, and completes the turn', async () => {
    const client = new FakeAppServer();
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('hello');
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' })));
    const [threadStart] = client.sent('thread/start');
    expect(typeof threadStart?.params.developerInstructions).toBe('string');
    expect(threadStart?.params.developerInstructions).toEqual(expect.stringContaining('You are Codex running inside KPM'));
    expect(threadStart?.params.developerInstructions).toEqual(expect.stringContaining('a request for Playwright must use an `mcp__playwright__*` tool'));
    expect(threadStart?.params.config).toMatchObject({
      mcp_servers: {
        'computer-use': { enabled: false },
      },
    });
    expect(client.sent('turn/start')[0]?.params.input).toEqual([{ type: 'text', text: 'hello' }]);
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', contextWindow: 1_050_000 }));
    client.emit('item/started', { item: { id: 'play-1', type: 'mcpToolCall', server: 'playwright', tool: 'browser_tabs', arguments: {}, readOnlyHint: true } });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'assistant' }));
  });

  it('resumes a stored app-server thread and queues a follow-up turn', async () => {
    const client = new FakeAppServer();
    const session = new CodexChatSession({ context: context(), resumeThreadId: 'old-thread', onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('first');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));
    session.send('second');
    await vi.waitFor(() => expect(client.requests.filter((request) => request.method === 'turn/start')).toHaveLength(2));
    expect(client.sent('thread/resume')[0]?.params.threadId).toBe('old-thread');
  });

  it('reports configured MCP health and starts OAuth only for the active thread', async () => {
    const client = new FakeAppServer();
    client.mcpServers = [{ name: 'linear', authStatus: 'notLoggedIn' }];
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('connect linear');
    client.emit('mcpServer/startupStatus/updated', { name: 'linear', status: 'failed', error: 'Sign in required' });

    await expect(session.mcp().list()).resolves.toEqual([{
      name: 'linear',
      status: 'failed',
      authStatus: 'notLoggedIn',
      error: 'Sign in required',
    }]);
    await expect(session.mcp().beginLogin!('linear')).resolves.toBe('https://linear.app/oauth/authorize');
    expect(client.requests).toContainEqual({
      method: 'mcpServer/oauth/login',
      params: { name: 'linear', threadId: 'thread-1' },
    });
  });

  it('interrupts the active app-server turn without dropping the session', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('wait');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));
    await session.interrupt();
    expect(client.requests).toContainEqual({ method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } });
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', usage: {} } });
    await session.close();
  });

  it('records a turn as the growth of the thread total, with input excluding cached tokens', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), model: 'gpt-5.5', onMessage, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('two requests');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));
    // A resumed thread: 1,000 input tokens were spent before this turn.
    const usage = (total: number[], last: number[]) => ({
      total: { inputTokens: total[0], cachedInputTokens: total[1], outputTokens: total[2], cacheWriteInputTokens: 0 },
      last: { inputTokens: last[0], cachedInputTokens: last[1], outputTokens: last[2], cacheWriteInputTokens: 0 },
      modelContextWindow: 272_000,
    });
    client.emit('thread/tokenUsage/updated', { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: usage([1_100, 80, 20], [100, 80, 10]) });
    client.emit('thread/tokenUsage/updated', { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: usage([1_250, 200, 35], [150, 120, 15]) });
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' })));
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'result',
      usage: { input_tokens: 50, cache_read_input_tokens: 200, cache_creation_input_tokens: 0, output_tokens: 25 },
      contextUsage: { input_tokens: 30, cache_read_input_tokens: 120, cache_creation_input_tokens: 0, output_tokens: 15 },
      model: 'gpt-5.5',
      costUnknown: true,
    }));
    await session.close();
  });

  it('shuts the app-server down when it reports a session error', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onSessionEnd = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), onSessionEnd, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('wait');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));

    client.emit('error', { error: { message: 'app-server exploded' }, willRetry: false });

    expect(onSessionEnd).toHaveBeenCalledWith('error', expect.any(Error));
    expect((onSessionEnd.mock.calls[0]?.[1] as Error).message).toContain('app-server exploded');
    expect(client.closed).toBe(true);
  });

  it('keeps the session alive while Codex retries an error itself', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onMessage = vi.fn();
    const onSessionEnd = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, onSessionEnd, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('wait');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));

    client.emit('error', { error: { message: 'stream disconnected', codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: null } } }, willRetry: true, threadId: 'thread-1', turnId: 'turn-1' });

    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(client.closed).toBe(false);
    const notice = sentMessages(onMessage).find((msg) => msg.type === 'provider_notice');
    expect(notice).toMatchObject({ label: 'Retrying' });
    expect(notice?.type === 'provider_notice' && notice.detail).toContain('stream disconnected');
    expect(sentMessages(onMessage).some((msg) => msg.type === 'provider_error')).toBe(false);
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
    await session.close();
  });

  it('tells the user to log in to Codex when an error is an auth failure', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onSessionEnd = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), onSessionEnd, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('wait');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));

    client.emit('error', { error: { message: '401 Unauthorized', codexErrorInfo: 'unauthorized' }, willRetry: false });

    const error = onSessionEnd.mock.calls[0]?.[1] as Error;
    expect(error.message).toMatch(/codex login/);
    expect(error.message).not.toMatch(/Claude|wait a moment/i);
  });

  it('reports a failed turn in Codex terms with its guidance and raw message', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('wait');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));

    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'failed', error: { message: 'You hit your usage limit. Try again at 5pm.', codexErrorInfo: 'usageLimitExceeded' } } });

    const failure = sentMessages(onMessage).find((msg) => msg.type === 'provider_error');
    const text = failure?.type === 'provider_error' ? failure.message : '';
    expect(text).toMatch(/^Codex usage limit reached\./);
    expect(text).toContain('Try again at 5pm.');
    expect(sentMessages(onMessage).some((msg) => msg.type === 'assistant')).toBe(false);
    await session.close();
  });

  it('shows a failed tool call as a note on the turn, not a turn error', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('wait');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));

    client.emit('item/completed', { item: { id: 'tool-1', type: 'mcpToolCall', server: 'linear', tool: 'get_issue', arguments: {}, error: { message: 'issue not found' } } });

    expect(sentMessages(onMessage)).toContainEqual({ type: 'provider_notice', label: 'Tool failed', detail: 'linear/get_issue: issue not found' });
    expect(sentMessages(onMessage).some((msg) => msg.type === 'provider_error')).toBe(false);
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
    await session.close();
  });

  it('sends image attachments by their own path and inlines text files by name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kpm-codex-test-'));
    const imagePath = join(dir, 'kpm-attach-1.png');
    const notesPath = join(dir, 'kpm-attach-2.md');
    writeFileSync(imagePath, 'image');
    writeFileSync(notesPath, '# Notes');
    const client = new FakeAppServer();
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('first');
    await vi.waitFor(() => expect(client.requests.filter((request) => request.method === 'turn/start')).toHaveLength(1));

    await session.sendWithAttachments('', [
      { kind: 'image', path: imagePath, filename: 'shot.png', mediaType: 'image/png' },
      { kind: 'text', path: notesPath, filename: 'notes.md', mediaType: 'text/markdown' },
    ]);

    await vi.waitFor(() => expect(client.requests.filter((request) => request.method === 'turn/start')).toHaveLength(2));
    expect(client.sent('turn/start')[1]?.params.input).toEqual([
      { type: 'localImage', path: imagePath },
      { type: 'text', text: '<file name="notes.md">\n# Notes\n</file>' },
    ]);
  });

  it('runs turns under the user\'s Codex sandbox and approval settings, with connected repos writable', async () => {
    const client = new FakeAppServer();
    client.userConfig = {
      approval_policy: 'never',
      sandbox_mode: 'workspace-write',
      sandbox_workspace_write: { writable_roots: ['/Users/me/.cache'], network_access: true, exclude_tmpdir_env_var: false, exclude_slash_tmp: false },
    };
    const withRepo = { ...context(), repos: [{ id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1', active_worktree_path: '/tmp/repo-1-wt' }] } as unknown as PlanContext;
    const session = new CodexChatSession({ context: withRepo, onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('fetch');
    await vi.waitFor(() => expect(client.sent('turn/start')).toHaveLength(1));
    expect(client.sent('config/read')[0]?.params).toEqual({ cwd: '/tmp/project' });
    expect(client.sent('turn/start')[0]?.params).toMatchObject({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/Users/me/.cache', '/tmp/project', '/tmp/repo-1-wt'], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
    });
  });

  it('leaves sandbox and approvals to Codex when the user has not set them', async () => {
    const client = new FakeAppServer();
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('hello');
    await vi.waitFor(() => expect(client.sent('turn/start')).toHaveLength(1));
    const params = { ...client.sent('thread/start')[0]?.params, ...client.sent('turn/start')[0]?.params };
    expect(params).not.toHaveProperty('approvalPolicy');
    expect(params).not.toHaveProperty('sandbox');
    expect(params).not.toHaveProperty('sandboxPolicy');
  });

  it('asks the user about each command and file change Codex wants approved', async () => {
    const client = new FakeAppServer();
    const requestExternalApproval = vi.fn(async (toolName: string) => toolName === 'Bash');
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), requestExternalApproval, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('edit');
    await expect(client.ask('item/commandExecution/requestApproval', { command: 'git fetch', cwd: '/tmp/project' })).resolves.toEqual({ decision: 'accept' });
    await expect(client.ask('item/fileChange/requestApproval', { itemId: 'patch-1' })).resolves.toEqual({ decision: 'decline' });
    expect(requestExternalApproval).toHaveBeenCalledWith('Bash', { command: 'git fetch', cwd: '/tmp/project', reason: undefined });
  });

  it('approves a read-only Playwright request and lets the same turn continue', async () => {
    const client = new FakeAppServer();
    const requestExternalApproval = vi.fn();
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, requestExternalApproval, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('list tabs');
    client.emit('item/started', { item: { id: 'tabs', type: 'mcpToolCall', server: 'playwright', tool: 'browser_tabs', arguments: {}, readOnlyHint: true } });
    await expect(client.ask('item/tool/requestUserInput', { itemId: 'tabs', questions: [{ id: 'approval', options: [{ label: 'Allow' }] }] })).resolves.toEqual({ answers: { approval: { answers: ['Allow'] } } });
    client.emit('item/completed', { item: { id: 'reply', type: 'agentMessage', text: 'One tab is open.' } });
    expect(requestExternalApproval).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith({ type: 'assistant', message: { content: [{ type: 'text', text: 'One tab is open.' }] } });
  });

  it('auto-approves Playwright browser interactions to match Claude MCP permissions', async () => {
    const client = new FakeAppServer();
    const requestExternalApproval = vi.fn().mockResolvedValue(false);
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), requestExternalApproval, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('click checkout');
    client.emit('item/started', { item: { id: 'click', type: 'mcpToolCall', server: 'playwright', tool: 'browser_click', arguments: {}, readOnlyHint: false } });
    await expect(client.ask('item/tool/requestUserInput', { itemId: 'click', questions: [{ id: 'approval', options: [{ label: 'Allow' }] }] })).resolves.toEqual({ answers: { approval: { answers: ['Allow'] } } });
    expect(requestExternalApproval).not.toHaveBeenCalled();
  });
});

describe('codexSandboxPolicy', () => {
  it.each([
    ['danger-full-access', { type: 'dangerFullAccess' }],
    ['read-only', { type: 'readOnly', networkAccess: false }],
    [undefined, null],
  ])('maps sandbox_mode %s', (mode, expected) => {
    expect(codexSandboxPolicy(mode ? { sandbox_mode: mode } : {}, ['/tmp/project'])).toEqual(expected);
  });
});

describe('codexToolCalls', () => {
  function shown(item: Record<string, unknown>) {
    return codexToolCalls(item).map((call) => ({
      label: getToolActivity(call.name, call.input)?.label,
      detail: getToolActivity(call.name, call.input)?.detail,
      filePaths: extractFilePaths(call.name, call.input),
    }));
  }

  it('shows and logs every file a patch changes', () => {
    expect(shown({ id: 'patch-1', type: 'fileChange', changes: [
      { path: '/repo/src/a.ts', kind: { type: 'update', move_path: null }, diff: '' },
      { path: '/repo/src/b.ts', kind: { type: 'add' }, diff: '' },
    ] })).toEqual([
      { label: 'a.ts', detail: '/repo/src/a.ts', filePaths: ['/repo/src/a.ts'] },
      { label: 'b.ts', detail: '/repo/src/b.ts', filePaths: ['/repo/src/b.ts'] },
    ]);
  });

  it('labels a web search with its query, not its changes', () => {
    expect(shown({ id: 'search-1', type: 'webSearch', query: 'vitest mock esm', action: null })).toEqual([
      { label: 'vitest mock esm', detail: undefined, filePaths: [] },
    ]);
  });

  it('surfaces MCP tool arguments in the card detail', () => {
    expect(shown({ id: 'mcp-1', type: 'mcpToolCall', server: 'linear', tool: 'get_issue', arguments: { id: 'KPM-12' } })).toEqual([
      { label: 'get issue', detail: 'id=KPM-12', filePaths: [] },
    ]);
  });
});

describe('CodexChatSession web search', () => {
  it('announces a search once, when its query first arrives', async () => {
    const client = new FakeAppServer();
    client.completeTurns = false;
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('search');
    await vi.waitFor(() => expect(client.requests.some((request) => request.method === 'turn/start')).toBe(true));
    client.emit('item/started', { item: { id: 'search-1', type: 'webSearch', query: '', action: null } });
    client.emit('item/completed', { item: { id: 'search-1', type: 'webSearch', query: 'codex app-server', action: null } });

    const blocks = (onMessage.mock.calls as [{ type: string; message?: { content: { type: string }[] } }][])
      .flatMap(([message]) => message.type === 'assistant' ? message.message?.content ?? [] : []);
    expect(blocks.filter((block) => block.type === 'tool_use')).toEqual([
      { type: 'tool_use', id: 'search-1', name: 'WebSearch', input: { query: 'codex app-server' } },
    ]);
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
    await session.close();
  });
});
