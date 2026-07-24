import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { getFocusKpmServer, getKpmServer, warmupMcpSdk } from './createKpmServer';
import {
  getKpmToolRuntime,
  runWithToolExecutionContext,
  subscribeToKpmToolProposals,
  type KpmToolDefinition,
  type KpmToolProposal,
} from './runtimeRegistry';
import { buildPiKpmTools } from '../pi/kpmToolAdapter';
import {
  registerCodexMcpSession,
  stopCodexMcpServerForTests,
} from '../codex/KpmCodexMcpServer';

const createSdkMcpServerMock = vi.hoisted(() => vi.fn((config: unknown) => config));

const mcpMocks = vi.hoisted(() => {
  interface Listener {
    once: (event: string, callback: (...args: unknown[]) => void) => Listener;
    emit: (event: string, ...args: unknown[]) => void;
    address: () => { port: number };
    close: (callback?: (error?: Error) => void) => void;
  }

  interface RegisteredTool {
    config: {
      description?: string;
      inputSchema?: unknown;
    };
    callback: (args: unknown, extra: unknown) => Promise<unknown>;
  }

  function toRegisteredToolDescriptors(tools: Map<string, RegisteredTool>): { name: string; description: string; parameters: unknown }[] {
    return [...tools.entries()].map(([name, tool]) => ({
      name,
      description: tool.config.description ?? '',
      parameters: z.toJSONSchema(z.object((tool.config.inputSchema ?? {}) as Record<string, unknown>), { unrepresentable: 'any' }),
    }));
  }

  function createListener(): Listener {
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    const listener: Listener = {
      once: (event, callback) => {
        listeners.set(event, [...(listeners.get(event) ?? []), callback]);
        return listener;
      },
      emit: (event, ...args) => {
        const callbacks = listeners.get(event) ?? [];
        listeners.delete(event);
        for (const callback of callbacks) callback(...args);
      },
      address: () => ({ port: 31337 }),
      close: (callback) => callback?.(),
    };
    return listener;
  }

  const apps: {
    postHandlers: Map<string, (req: unknown, res: unknown) => Promise<void>>;
  }[] = [];

  class MockMcpServer {
    readonly tools = new Map<string, RegisteredTool>();

    registerTool(
      name: string,
      config: RegisteredTool['config'],
      callback: (args: unknown, extra: unknown) => Promise<unknown>,
    ): unknown {
      this.tools.set(name, { config, callback });
      return undefined;
    }

    async connect(transport: { mcpServer?: MockMcpServer }): Promise<void> {
      transport.mcpServer = this;
    }

    async close(): Promise<void> {}
  }

  class MockTransport {
    mcpServer?: MockMcpServer;

    async handleRequest(_req: unknown, res: { status: (code: number) => unknown; json: (body: unknown) => void }, body: unknown): Promise<void> {
      const request = body as { id?: string; method?: string; params?: { name?: string; arguments?: unknown; args?: unknown } };
      if (request.method === 'tools/list') {
        res.json({ result: { tools: toRegisteredToolDescriptors(this.mcpServer?.tools ?? new Map()) } });
        return;
      }

      const toolName = request.params?.name;
      const registeredTool = toolName ? this.mcpServer?.tools.get(toolName) : undefined;
      if (!registeredTool) {
        res.status(404);
        res.json({ error: 'Unknown tool' });
        return;
      }

      const result = await registeredTool.callback(
        request.params?.arguments ?? request.params?.args ?? {},
        { requestId: request.id },
      );
      res.json({ result });
    }

    async close(): Promise<void> {}
  }

  return {
    apps,
    createMcpExpressApp: vi.fn(() => {
      const app = {
        postHandlers: new Map<string, (req: unknown, res: unknown) => Promise<void>>(),
        post(path: string, handler: (req: unknown, res: unknown) => Promise<void>) {
          this.postHandlers.set(path, handler);
        },
        get() {},
        delete() {},
        listen() {
          const listener = createListener();
          queueMicrotask(() => listener.emit('listening'));
          return listener;
        },
      };
      apps.push(app);
      return app;
    }),
    McpServer: MockMcpServer,
    StreamableHTTPServerTransport: MockTransport,
  };
});

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: createSdkMcpServerMock,
  tool: (name: string, description: string, inputSchema: Record<string, unknown>, handler: KpmToolDefinition['handler']) => ({
    name,
    description,
    inputSchema,
    handler: async (args: unknown, extra: unknown) => {
      if (
        Object.prototype.hasOwnProperty.call(inputSchema, 'projectId')
        && (!args || typeof args !== 'object' || !Object.prototype.hasOwnProperty.call(args, 'projectId'))
      ) {
        throw new Error('Invalid tool arguments: projectId is required');
      }
      return handler(args, extra);
    },
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/express.js', () => ({
  createMcpExpressApp: mcpMocks.createMcpExpressApp,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mcpMocks.McpServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: mcpMocks.StreamableHTTPServerTransport,
}));

vi.mock('../db/connection', () => ({
  getDatabase: () => ({}),
}));

interface CapturedClaudeServer {
  name: string;
  version: string;
  tools: KpmToolDefinition[];
  alwaysLoad: boolean;
}

interface ProviderDescriptor {
  name: string;
  description: string;
  parameters: unknown;
}

interface FakeCodexResponse {
  statusCode: number;
  body: unknown;
  headersSent: boolean;
  status: (code: number) => FakeCodexResponse;
  json: (body: unknown) => void;
  on: (event: 'close', listener: () => void) => FakeCodexResponse;
}

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const CHAT_SESSION_ID = 'chat-1';

function warmRuntime(options: {
  projectFolderPath?: string;
  fileExplorerService?: unknown;
} = {}): void {
  warmupMcpSdk({
    container: {
      projects: {
        get: (projectId: string) => (
          options.projectFolderPath && projectId === PROJECT_ID
            ? { id: projectId, folder_path: options.projectFolderPath }
            : undefined
        ),
      },
      planItems: {},
      planRelations: {},
      groups: {},
      repos: { getByProject: () => [] },
      devSessions: {},
      confluenceLinks: {},
    } as never,
    services: {
      fileExplorerService: options.fileExplorerService ?? {},
    } as never,
    getMainWindow: () => null,
  });
}

function toolNames(tools: { name: string }[]): string[] {
  return tools.map((tool) => tool.name);
}

function jsonSchemaForInputSchema(inputSchema: Record<string, unknown>): unknown {
  return z.toJSONSchema(z.object(inputSchema), { unrepresentable: 'any' });
}

function providerDescriptors(tools: KpmToolDefinition[]): ProviderDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: jsonSchemaForInputSchema(tool.inputSchema),
  }));
}

function piProviderDescriptors(tools: ReturnType<typeof buildPiKpmTools>['tools']): ProviderDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function createFakeResponse(): FakeCodexResponse {
  const response: FakeCodexResponse = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
    },
    on() {
      return this;
    },
  };
  return response;
}

async function listCodexRegisteredProviderDescriptors(options: { focus: boolean }): Promise<ProviderDescriptor[]> {
  const registration = await registerCodexMcpSession({
    projectId: PROJECT_ID,
    chatSessionId: CHAT_SESSION_ID,
    focus: options.focus,
  });
  const sessionId = registration.url.split('/').pop();
  expect(sessionId).toBeDefined();

  const app = mcpMocks.apps[0];
  const handlePost = app.postHandlers.get('/mcp/:sessionId');
  expect(handlePost).toBeDefined();

  const response = createFakeResponse();
  await handlePost!(
    {
      params: { sessionId },
      headers: { authorization: `Bearer ${registration.token}` },
      body: { id: 'list-tools-1', method: 'tools/list' },
    },
    response,
  );

  expect(response.statusCode).toBe(200);
  const body = response.body as { result?: { tools?: ProviderDescriptor[] } };
  expect(body.result?.tools).toBeDefined();
  return body.result!.tools!;
}

afterEach(async () => {
  vi.restoreAllMocks();
  createSdkMcpServerMock.mockClear();
  mcpMocks.apps.length = 0;
  await stopCodexMcpServerForTests();
});

describe('KPM provider tool adapter parity', () => {
  it('routes Claude MCP tool execution through the scoped KPM runtime facade', async () => {
    warmRuntime();
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool').mockResolvedValue({
      ok: true,
      content: [{ type: 'text', text: 'runtime result' }],
      mcpResult: { content: [{ type: 'text', text: 'runtime result' }] },
    });

    const server = getKpmServer() as unknown as CapturedClaudeServer;
    const tool = server.tools.find((candidate) => candidate.name === 'query_plan_items');
    expect(tool).toBeDefined();

    const result = await runWithToolExecutionContext(
      { projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID },
      () => tool!.handler({ projectId: PROJECT_ID }, { requestId: 'request-1' }),
    );

    expect(executeSpy).toHaveBeenCalledWith({
      name: 'query_plan_items',
      args: { projectId: PROJECT_ID },
      extra: { requestId: 'request-1' },
      projectId: PROJECT_ID,
      chatSessionId: CHAT_SESSION_ID,
      scope: 'main',
    });
    expect(result).toEqual({ content: [{ type: 'text', text: 'runtime result' }] });
  });

  it('emits modify_plan approval proposals through the runtime-routed Claude MCP tool path', async () => {
    warmRuntime();
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool');
    const server = getKpmServer() as unknown as CapturedClaudeServer;
    const tool = server.tools.find((candidate) => candidate.name === 'modify_plan');
    expect(tool).toBeDefined();

    const action = { type: 'update_item' as const, item_id: 'item-1', updates: { status_category: 'in_progress' as const } };
    const args = { message: 'Move the item into progress', actions: [action] };
    const proposals: KpmToolProposal[] = [];
    const unsubscribe = subscribeToKpmToolProposals((proposal) => proposals.push(proposal));

    try {
      const result = await runWithToolExecutionContext(
        { projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID },
        () => tool!.handler(args, { requestId: 'request-plan-1' }),
      );

      expect(executeSpy).toHaveBeenCalledWith({
        name: 'modify_plan',
        args,
        extra: { requestId: 'request-plan-1' },
        projectId: PROJECT_ID,
        chatSessionId: CHAT_SESSION_ID,
        scope: 'main',
      });
      expect(proposals).toEqual([{ type: 'plan-actions', projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID, actions: [action] }]);
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Plan changes submitted to KPM.', actionCount: 1 }) }],
      });
    } finally {
      unsubscribe();
    }
  });

  it('emits document approval proposals through the runtime-routed Claude MCP tool path', async () => {
    warmRuntime();
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool');
    const server = getKpmServer() as unknown as CapturedClaudeServer;
    const tool = server.tools.find((candidate) => candidate.name === 'propose_document_create');
    expect(tool).toBeDefined();

    const args = {
      projectId: PROJECT_ID,
      filePath: 'notes/decision.md',
      content: '# Decision\n\nKeep runtime-routed proposals covered.\n',
    };
    const proposals: KpmToolProposal[] = [];
    const unsubscribe = subscribeToKpmToolProposals((proposal) => proposals.push(proposal));

    try {
      const result = await runWithToolExecutionContext(
        { projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID },
        () => tool!.handler(args, { requestId: 'request-document-1' }),
      );

      expect(executeSpy).toHaveBeenCalledWith({
        name: 'propose_document_create',
        args,
        extra: { requestId: 'request-document-1' },
        projectId: PROJECT_ID,
        chatSessionId: CHAT_SESSION_ID,
        scope: 'main',
      });
      expect(proposals).toEqual([{ type: 'document-update', ...args, oldContent: null, chatSessionId: CHAT_SESSION_ID }]);
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            filePath: args.filePath,
            contentPreview: '# Decision',
            message: 'Submitted new file "notes/decision.md". Preview: # Decision',
          }),
        }],
      });
    } finally {
      unsubscribe();
    }
  });

  it('emits CLAUDE.md context edit approval proposals through the runtime-routed Claude MCP tool path', async () => {
    const projectFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'kpm-provider-parity-'));
    const originalContent = '# Context\n\n- Keep existing behavior.\n';
    await fs.writeFile(path.join(projectFolderPath, 'CLAUDE.md'), originalContent, 'utf8');

    const proposals: KpmToolProposal[] = [];
    const unsubscribe = subscribeToKpmToolProposals((proposal) => proposals.push(proposal));

    try {
      warmRuntime({ projectFolderPath });
      const runtime = getKpmToolRuntime();
      const executeSpy = vi.spyOn(runtime, 'executeTool');
      const server = getKpmServer() as unknown as CapturedClaudeServer;
      const tool = server.tools.find((candidate) => candidate.name === 'propose_context_edit');
      expect(tool).toBeDefined();

      const args = {
        projectId: PROJECT_ID,
        old_string: '- Keep existing behavior.',
        new_string: '- Preserve existing behavior.',
      };
      const result = await runWithToolExecutionContext(
        { projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID },
        () => tool!.handler(args, { requestId: 'request-context-1' }),
      );

      expect(executeSpy).toHaveBeenCalledWith({
        name: 'propose_context_edit',
        args,
        extra: { requestId: 'request-context-1' },
        projectId: PROJECT_ID,
        chatSessionId: CHAT_SESSION_ID,
        scope: 'main',
      });
      expect(proposals).toEqual([{
        type: 'project-context-update',
        projectId: PROJECT_ID,
        newContent: '# Context\n\n- Preserve existing behavior.\n',
        oldContent: originalContent,
        filename: 'CLAUDE.md',
        chatSessionId: CHAT_SESSION_ID,
      }]);
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Project context file edit submitted to KPM.' }) }],
      });
    } finally {
      unsubscribe();
      await fs.rm(projectFolderPath, { recursive: true, force: true });
    }
  });

  it('emits file-delete approval proposals through the runtime-routed Claude MCP tool path', async () => {
    const fileExplorerService = {
      getInfo: vi.fn().mockResolvedValue({ ok: true, data: { isDirectory: false } }),
    };
    warmRuntime({ fileExplorerService });
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool');
    const server = getKpmServer() as unknown as CapturedClaudeServer;
    const tool = server.tools.find((candidate) => candidate.name === 'delete_project_file');
    expect(tool).toBeDefined();

    const args = { projectId: PROJECT_ID, path: 'drafts/old.md' };
    const proposals: KpmToolProposal[] = [];
    const unsubscribe = subscribeToKpmToolProposals((proposal) => proposals.push(proposal));

    try {
      const result = await runWithToolExecutionContext(
        { projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID },
        () => tool!.handler(args, { requestId: 'request-delete-1' }),
      );

      expect(executeSpy).toHaveBeenCalledWith({
        name: 'delete_project_file',
        args,
        extra: { requestId: 'request-delete-1' },
        projectId: PROJECT_ID,
        chatSessionId: CHAT_SESSION_ID,
        scope: 'main',
      });
      expect(fileExplorerService.getInfo).toHaveBeenCalledWith(PROJECT_ID, 'drafts/old.md');
      expect(proposals).toEqual([{ type: 'file-delete', projectId: PROJECT_ID, path: 'drafts/old.md', isDirectory: false, chatSessionId: CHAT_SESSION_ID }]);
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            proposedPath: 'drafts/old.md',
            isDirectory: false,
            message: 'Submitted deletion of "drafts/old.md" to KPM.',
          }),
        }],
      });
    } finally {
      unsubscribe();
    }
  });

  it('documents the deliberate unscoped Claude fallback by preserving tool argument errors instead of front-loading a generic project-context error', async () => {
    warmRuntime();
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool');
    const server = getKpmServer() as unknown as CapturedClaudeServer;
    const tool = server.tools.find((candidate) => candidate.name === 'query_plan_items');
    expect(tool).toBeDefined();

    await expect(tool!.handler({}, { requestId: 'request-1' })).rejects.toThrow('projectId is required');

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('routes pi tool execution through the scoped KPM runtime facade', async () => {
    warmRuntime();
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool').mockResolvedValue({
      ok: true,
      content: [{ type: 'text', text: 'runtime result' }],
      mcpResult: { content: [{ type: 'text', text: 'runtime result' }] },
    });

    const { tools } = buildPiKpmTools({ focus: false, projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID });
    const tool = tools.find((candidate) => candidate.name === 'query_plan_items');
    expect(tool).toBeDefined();

    const result = await tool!.execute('call-1', { projectId: PROJECT_ID }, undefined, undefined, {});

    expect(executeSpy).toHaveBeenCalledWith({
      name: 'query_plan_items',
      args: { projectId: PROJECT_ID },
      extra: {},
      projectId: PROJECT_ID,
      chatSessionId: CHAT_SESSION_ID,
      scope: 'main',
    });
    expect(result).toEqual({ content: [{ type: 'text', text: 'runtime result' }], details: {} });
  });

  it('routes Codex MCP tool execution through the scoped KPM runtime facade', async () => {
    warmRuntime();
    const runtime = getKpmToolRuntime();
    const executeSpy = vi.spyOn(runtime, 'executeTool').mockResolvedValue({
      ok: true,
      content: [{ type: 'text', text: 'runtime result' }],
      mcpResult: { content: [{ type: 'text', text: 'runtime result' }] },
    });

    const registration = await registerCodexMcpSession({ projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID });
    const sessionId = registration.url.split('/').pop();
    expect(sessionId).toBeDefined();
    const app = mcpMocks.apps[0];
    const handlePost = app.postHandlers.get('/mcp/:sessionId');
    expect(handlePost).toBeDefined();

    const response = createFakeResponse();
    await handlePost!(
      {
        params: { sessionId },
        headers: { authorization: `Bearer ${registration.token}` },
        body: { id: 'request-1', params: { name: 'query_plan_items', arguments: { projectId: PROJECT_ID } } },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ result: { content: [{ type: 'text', text: 'runtime result' }] } });
    expect(executeSpy).toHaveBeenCalledWith({
      name: 'query_plan_items',
      args: { projectId: PROJECT_ID },
      extra: { requestId: 'request-1' },
      projectId: PROJECT_ID,
      chatSessionId: CHAT_SESSION_ID,
      scope: 'main',
    });
  });

  it('exposes the same main Chat Session KPM tool contract through Claude, pi, and Codex adapters', async () => {
    warmRuntime();

    const claudeTools = (getKpmServer() as unknown as CapturedClaudeServer).tools;
    const piTools = buildPiKpmTools({ focus: false, projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID }).tools;
    const codexRegisteredDescriptors = await listCodexRegisteredProviderDescriptors({ focus: false });

    expect(piProviderDescriptors(piTools)).toEqual(providerDescriptors(claudeTools));
    expect(codexRegisteredDescriptors).toEqual(providerDescriptors(claudeTools));
  });

  it('keeps focus-document Chat Session KPM tool contracts reduced consistently across provider adapters', async () => {
    warmRuntime();

    const focusClaudeTools = (getFocusKpmServer() as unknown as CapturedClaudeServer).tools;
    const focusPiTools = buildPiKpmTools({ focus: true, projectId: PROJECT_ID, chatSessionId: CHAT_SESSION_ID }).tools;
    const focusCodexRegisteredDescriptors = await listCodexRegisteredProviderDescriptors({ focus: true });
    const mainManifestNames = toolNames(getKpmToolRuntime().listToolManifest({ scope: 'main' }));

    expect(piProviderDescriptors(focusPiTools)).toEqual(providerDescriptors(focusClaudeTools));
    expect(focusCodexRegisteredDescriptors).toEqual(providerDescriptors(focusClaudeTools));
    expect(toolNames(focusClaudeTools)).not.toContain('modify_plan');
    expect(toolNames(focusClaudeTools).every((name) => mainManifestNames.includes(name))).toBe(true);
  });
});
