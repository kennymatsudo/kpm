import { randomBytes, randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import type { Server as HttpServer } from 'http';
// The MCP SDK package exports require the `.js` suffix at runtime under
// Electron's CJS loader, even though eslint-import's resolver does not see it.
// eslint-disable-next-line import-x/no-unresolved
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
// eslint-disable-next-line import-x/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import-x/no-unresolved
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  getFocusKpmToolDefinitions,
  getKpmToolDefinitions,
  KPM_MCP_INSTRUCTIONS,
  runWithToolExecutionContext,
  type KpmToolDefinition,
} from '../claude/tools/createKpmServer';

interface RegisteredCodexMcpSession {
  token: string;
  projectId: string;
  chatSessionId?: string;
  focus: boolean;
}

interface McpRequest {
  params: { sessionId: string };
  headers: { authorization?: string | string[] };
  body?: unknown;
}

interface McpResponse {
  status(code: number): McpResponse;
  json(body: unknown): void;
  headersSent: boolean;
  on(event: 'close', listener: () => void): McpResponse;
}

type RegisterToolLoose = (
  name: string,
  config: {
    description?: string;
    inputSchema?: unknown;
    annotations?: unknown;
    _meta?: Record<string, unknown>;
  },
  callback: (args: unknown, extra: unknown) => Promise<CallToolResult>,
) => unknown;

export interface CodexMcpRegistration {
  url: string;
  token: string;
  dispose: () => void;
}

let server: HttpServer | null = null;
let port: number | null = null;
let startupPromise: Promise<number> | null = null;

const sessions = new Map<string, RegisteredCodexMcpSession>();

function createToken(): string {
  return randomBytes(32).toString('base64url');
}

function isAuthorized(header: unknown, token: string): boolean {
  if (typeof header !== 'string') return false;
  return header === `Bearer ${token}`;
}

function toolDefinitionsForSession(session: RegisteredCodexMcpSession): KpmToolDefinition[] {
  return session.focus ? getFocusKpmToolDefinitions() : getKpmToolDefinitions();
}

function createMcpServerForSession(session: RegisteredCodexMcpSession): McpServer {
  const mcpServer = new McpServer(
    { name: 'kpm', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: KPM_MCP_INSTRUCTIONS,
    },
  );
  const registerTool = mcpServer.registerTool.bind(mcpServer) as unknown as RegisterToolLoose;

  for (const tool of toolDefinitionsForSession(session)) {
    registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        _meta: tool._meta,
      },
      async (args: unknown, extra: unknown) => {
        const result = await runWithToolExecutionContext(
          { projectId: session.projectId, chatSessionId: session.chatSessionId },
          () => tool.handler(args, extra),
        );
        return result as CallToolResult;
      },
    );
  }

  return mcpServer;
}

async function closeTransportAndServer(
  transport: StreamableHTTPServerTransport,
  mcpServer: McpServer,
): Promise<void> {
  await Promise.allSettled([
    transport.close(),
    mcpServer.close(),
  ]);
}

async function ensureServerStarted(): Promise<number> {
  if (port !== null) return port;
  if (startupPromise) return startupPromise;

  startupPromise = new Promise<number>((resolve, reject) => {
    const app = createMcpExpressApp({ host: '127.0.0.1' });

    const handlePost = async (req: McpRequest, res: McpResponse) => {
      const sessionId = req.params.sessionId;
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Unknown KPM MCP session' });
        return;
      }
      if (!isAuthorized(req.headers.authorization, session.token)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const mcpServer = createMcpServerForSession(session);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      try {
        await mcpServer.connect(transport);
        res.on('close', () => {
          void closeTransportAndServer(transport, mcpServer);
        });
        await transport.handleRequest(
          req as unknown as Parameters<StreamableHTTPServerTransport['handleRequest']>[0],
          res as unknown as Parameters<StreamableHTTPServerTransport['handleRequest']>[1],
          req.body,
        );
      } catch (error) {
        console.error('[KPM Codex MCP] Failed to handle MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
        await closeTransportAndServer(transport, mcpServer);
      }
    };

    app.post('/mcp/:sessionId', handlePost as never);

    const handleMethodNotAllowed = (_req: McpRequest, res: McpResponse) => {
      res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      });
    };

    app.get('/mcp/:sessionId', handleMethodNotAllowed as never);
    app.delete('/mcp/:sessionId', handleMethodNotAllowed as never);

    const listener = app.listen(0, '127.0.0.1');
    listener.once('error', (error: Error) => {
      startupPromise = null;
      reject(error);
    });
    listener.once('listening', () => {
      server = listener;
      const address = listener.address() as AddressInfo;
      port = address.port;
      console.log(`[KPM Codex MCP] Listening on 127.0.0.1:${port}`);
      resolve(port);
    });
  });

  return startupPromise;
}

export async function registerCodexMcpSession(options: {
  projectId: string;
  chatSessionId?: string;
  focus?: boolean;
}): Promise<CodexMcpRegistration> {
  const activePort = await ensureServerStarted();
  const sessionId = randomUUID();
  const token = createToken();
  sessions.set(sessionId, {
    token,
    projectId: options.projectId,
    chatSessionId: options.chatSessionId,
    focus: options.focus ?? false,
  });

  return {
    url: `http://127.0.0.1:${activePort}/mcp/${sessionId}`,
    token,
    dispose: () => {
      sessions.delete(sessionId);
    },
  };
}

export async function stopCodexMcpServerForTests(): Promise<void> {
  sessions.clear();
  const activeServer = server;
  server = null;
  port = null;
  startupPromise = null;
  if (!activeServer) return;
  await new Promise<void>((resolve, reject) => {
    activeServer.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
