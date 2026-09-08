import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'fs';
import { CodexChatSession } from './CodexChatSession';
import type { CodexAppServerClient } from './CodexAppServerClient';
import type { PlanContext } from '../chat/prompts';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';

type Handler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

class FakeAppServer {
  readonly requests: { method: string; params: Record<string, unknown> }[] = [];
  completeTurns = true;
  mcpServers: Record<string, unknown>[] = [];
  private notification: ((method: string, params: Record<string, unknown>) => void) | null = null;
  private serverRequest: Handler | null = null;
  async initialize(): Promise<void> {}
  onNotification(handler: (method: string, params: Record<string, unknown>) => void): () => void { this.notification = handler; return () => { this.notification = null; }; }
  setServerRequestHandler(handler: Handler): void { this.serverRequest = handler; }
  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: 'thread-1' } };
    if (method === 'mcpServerStatus/list') return { data: this.mcpServers };
    if (method === 'mcpServer/oauth/login') return { authorizationUrl: 'https://linear.app/oauth/authorize' };
    if (method === 'turn/start') {
      if (!this.completeTurns) return { turn: { id: 'turn-1' } };
      queueMicrotask(() => this.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', usage: { inputTokens: 2, outputTokens: 3, cachedInputTokens: 1 } } }));
      return { turn: { id: 'turn-1' } };
    }
    return {};
  }
  close(): void {}
  emit(method: string, params: Record<string, unknown>): void { this.notification?.(method, params); }
  ask(method: string, params: Record<string, unknown>): Promise<unknown> { return this.serverRequest?.(method, params) ?? Promise.resolve({}); }
}

function context(): PlanContext {
  return { project: { id: 'project-1', name: 'Project', phase: 'discovery', folder_path: '/tmp/project', storybook_url: null, created_at: '2026-01-01T00:00:00.000Z', session_tokens: 0, session_input_tokens: 0, session_output_tokens: 0 }, repos: [], attachments: [], planItems: [], focusedResources: [] };
}

function registration() { return { url: 'http://127.0.0.1:1234/mcp/kpm', token: 'token', dispose: vi.fn() }; }

describe('CodexChatSession', () => {
  it('starts through app-server, streams items, and completes the turn', async () => {
    const client = new FakeAppServer();
    const onMessage = vi.fn();
    const session = new CodexChatSession({ context: context(), onMessage, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('hello');
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' })));
    expect(client.requests[0]?.method).toBe('thread/start');
    expect(client.requests[0]?.params.approvalPolicy).toBe('on-request');
    expect(client.requests[0]?.params.sandbox).toBe('read-only');
    expect(typeof client.requests[0]?.params.developerInstructions).toBe('string');
    expect(client.requests[0]?.params.developerInstructions).toEqual(expect.stringContaining('You are Codex running inside KPM'));
    expect(client.requests[0]?.params.developerInstructions).toEqual(expect.stringContaining('a request for Playwright must use an `mcp__playwright__*` tool'));
    expect(client.requests[0]?.params.config).toMatchObject({
      mcp_servers: {
        'computer-use': { enabled: false },
      },
    });
    expect(client.requests[1]).toMatchObject({ method: 'turn/start', params: { input: [{ type: 'text', text: 'hello' }], sandboxPolicy: { type: 'readOnly' } } });
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
    expect(client.requests[0]).toMatchObject({ method: 'thread/resume', params: { threadId: 'old-thread' } });
  });

  it('reports configured MCP health and starts OAuth only for the active thread', async () => {
    const client = new FakeAppServer();
    client.mcpServers = [{ name: 'linear', authStatus: 'notLoggedIn' }];
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('connect linear');
    client.emit('mcpServer/startupStatus/updated', { name: 'linear', status: 'failed', error: 'Sign in required' });

    await expect(session.codexMcpServerStatus()).resolves.toEqual([{
      name: 'linear',
      status: 'failed',
      authStatus: 'notLoggedIn',
      error: 'Sign in required',
    }]);
    await expect(session.loginMcpServer('linear')).resolves.toBe('https://linear.app/oauth/authorize');
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

  it('sends base64 image attachments as local app-server images and removes the temporary file', async () => {
    const client = new FakeAppServer();
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('first');
    await vi.waitFor(() => expect(client.requests.filter((request) => request.method === 'turn/start')).toHaveLength(1));
    client.completeTurns = false;
    const content: ContentBlockParam[] = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from('image').toString('base64') } },
      { type: 'text', text: 'describe this image' },
    ];
    await session.sendUserContent(content);
    await vi.waitFor(() => expect(client.requests.filter((request) => request.method === 'turn/start')).toHaveLength(2));
    const input = client.requests[2]?.params.input as { type: string; path?: string }[];
    const image = input[0];
    expect(image).toMatchObject({ type: 'localImage' });
    expect(image?.path && existsSync(image.path)).toBe(true);
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', usage: {} } });
    await vi.waitFor(() => expect(image?.path && existsSync(image.path)).toBe(false));
  });

  it('keeps file and shell writes denied without a project grant', async () => {
    const client = new FakeAppServer();
    const requestWriteConsent = vi.fn().mockResolvedValue({ allowed: false, reason: 'denied' });
    const session = new CodexChatSession({ context: context(), onMessage: vi.fn(), requestWriteConsent, hasWriteAccess: () => false, registerMcpSession: async () => registration(), createAppServerClient: () => client as unknown as CodexAppServerClient });
    await session.start('edit');
    await expect(client.ask('item/fileChange/requestApproval', {})).resolves.toEqual({ decision: 'decline' });
    await expect(client.ask('item/commandExecution/requestApproval', { command: 'touch changed.txt' })).resolves.toEqual({ decision: 'decline' });
    await expect(client.ask('item/commandExecution/requestApproval', { command: 'git status' })).resolves.toEqual({ decision: 'accept' });
    expect(requestWriteConsent).toHaveBeenCalledTimes(2);
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
