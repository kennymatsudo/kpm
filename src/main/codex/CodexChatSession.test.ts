import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Codex } from '@openai/codex-sdk';
import { CodexChatSession } from './CodexChatSession';
import { stopCodexMcpServerForTests } from './KpmCodexMcpServer';
import type { PlanContext } from '../claude/prompts';

const codexMocks = vi.hoisted(() => ({
  runStreamed: vi.fn(),
  startThread: vi.fn(),
  resumeThread: vi.fn(),
}));

const mcpMocks = vi.hoisted(() => ({
  registerCodexMcpSession: vi.fn(),
  dispose: vi.fn(),
  stopCodexMcpServerForTests: vi.fn(),
}));

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(function Codex() {
    return {
      startThread: codexMocks.startThread,
      resumeThread: codexMocks.resumeThread,
    };
  }),
}));

vi.mock('./binary', () => ({
  findCodexBinaryPath: () => '/tmp/codex',
}));

vi.mock('./KpmCodexMcpServer', () => ({
  registerCodexMcpSession: mcpMocks.registerCodexMcpSession,
  stopCodexMcpServerForTests: mcpMocks.stopCodexMcpServerForTests,
}));

async function* streamEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < 100; i += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

function makeContext(): PlanContext {
  return {
    project: {
      id: 'project-1',
      name: 'Test Project',
      phase: 'discovery',
      folder_path: '/tmp/project',
      storybook_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      session_tokens: 0,
      session_input_tokens: 0,
      session_output_tokens: 0,
    },
    repos: [],
    attachments: [],
    planItems: [],
    focusedResources: [],
  };
}

function isResultMessage(
  value: unknown,
): value is { type: 'result'; usage?: { input_tokens?: number; output_tokens?: number } } {
  if (!value || typeof value !== 'object') return false;
  return 'type' in value && value.type === 'result';
}

interface CodexOptionsForTest {
  codexPathOverride?: unknown;
  env?: Record<string, unknown>;
  config?: {
    mcp_servers?: {
      kpm?: {
        url?: unknown;
        bearer_token_env_var?: unknown;
        required?: unknown;
        default_tools_approval_mode?: unknown;
      };
    };
  };
}

describe('CodexChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexMocks.startThread.mockReturnValue({
      runStreamed: codexMocks.runStreamed,
    });
    codexMocks.resumeThread.mockReturnValue({
      runStreamed: codexMocks.runStreamed,
    });
    mcpMocks.registerCodexMcpSession.mockResolvedValue({
      url: 'http://127.0.0.1:12345/mcp/session-1',
      token: 'test-token',
      dispose: mcpMocks.dispose,
    });
  });

  afterEach(async () => {
    await stopCodexMcpServerForTests();
  });

  it('starts a read-only native Codex thread and translates events to chat messages', async () => {
    codexMocks.runStreamed.mockResolvedValue({
      events: streamEvents([
        { type: 'thread.started', thread_id: 'thread-1' },
        {
          type: 'item.completed',
          item: { id: 'message-1', type: 'agent_message', text: 'Hello from Codex' },
        },
        {
          type: 'turn.completed',
          usage: { input_tokens: 10, output_tokens: 4, cached_input_tokens: 2 },
        },
      ]),
    });
    const onMessage = vi.fn();
    const onReady = vi.fn();

    const session = new CodexChatSession({
      context: makeContext(),
      onMessage,
      onReady,
    });

    await session.start('hello');

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' }));
    });

    expect(codexMocks.startThread).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: '/tmp/project',
      sandboxMode: 'read-only',
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
    }));
    const codexOptions = vi.mocked(Codex).mock.calls[0]?.[0] as CodexOptionsForTest | undefined;
    expect(codexOptions?.codexPathOverride).toBe('/tmp/codex');
    expect(codexOptions?.config?.mcp_servers?.kpm?.url).toBe('http://127.0.0.1:12345/mcp/session-1');
    expect(codexOptions?.config?.mcp_servers?.kpm?.bearer_token_env_var).toBe('KPM_MCP_TOKEN');
    expect(codexOptions?.config?.mcp_servers?.kpm?.required).toBe(true);
    expect(codexOptions?.config?.mcp_servers?.kpm?.default_tools_approval_mode).toBe('approve');
    expect(codexOptions?.env?.KPM_MCP_TOKEN).toBe('test-token');
    const firstInput = codexMocks.runStreamed.mock.calls[0]?.[0] as unknown;
    expect(firstInput).toEqual(expect.stringContaining('# User'));
    expect(firstInput).toEqual(expect.stringContaining('hello'));
    expect(onReady).toHaveBeenCalledWith('thread-1');
    expect(onMessage).toHaveBeenCalledWith({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello from Codex' }] },
    });
    expect(onMessage).toHaveBeenCalledWith({
      type: 'result',
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 0,
      },
      session_id: 'thread-1',
    });
  });

  it('drains queued follow-up turns after the current turn completes', async () => {
    const releaseFirstTurn = deferred();
    async function* firstTurnEvents() {
      yield { type: 'thread.started', thread_id: 'thread-1' };
      await releaseFirstTurn.promise;
      yield {
        type: 'turn.completed',
        usage: { input_tokens: 1, output_tokens: 1, cached_input_tokens: 0 },
      };
    }

    codexMocks.runStreamed
      .mockResolvedValueOnce({ events: firstTurnEvents() })
      .mockResolvedValueOnce({
        events: streamEvents([
          {
            type: 'turn.completed',
            usage: { input_tokens: 2, output_tokens: 3, cached_input_tokens: 0 },
          },
        ]),
      });
    const onMessage = vi.fn();
    const session = new CodexChatSession({
      context: makeContext(),
      onMessage,
    });

    await session.start('first');
    await waitFor(() => {
      expect(session.getSessionId()).toBe('thread-1');
    });

    session.send('second');
    expect(session.pendingQueuedCount()).toBe(1);

    releaseFirstTurn.resolve();

    await waitFor(() => {
      expect(codexMocks.runStreamed).toHaveBeenCalledTimes(2);
    });
    const secondInput = codexMocks.runStreamed.mock.calls[1]?.[0] as unknown;
    expect(secondInput).toBe('second');
    await waitFor(() => {
      const messages = (onMessage.mock.calls as unknown[][]).map((call) => call[0]);
      expect(messages.some((message) =>
        isResultMessage(message) &&
        message.usage?.input_tokens === 2 &&
        message.usage?.output_tokens === 3
      )).toBe(true);
    });
  });
});
