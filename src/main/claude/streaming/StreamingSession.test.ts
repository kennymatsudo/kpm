/**
 * StreamingSession unit tests.
 *
 * Drives the SUT through real lifecycle flows by feeding controlled SDK
 * messages from a fake `query()` implementation, then asserts on the
 * resulting public state and callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServerStatus, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  createControlledSdkStream,
  type SdkStreamHandle,
} from '../../../../tests/mocks/claudeSdk';
import { StreamingSession, type StreamingSessionConfig } from './StreamingSession';

interface QueryMockState {
  build: () => {
    iterable: AsyncIterable<SDKMessage>;
    handle: SdkStreamHandle;
  };
}

// Hoisted because vi.mock is hoisted above imports.
const { queryMockState } = vi.hoisted(() => {
  const state: QueryMockState = {
    build: () => {
      throw new Error('queryMockState.build not initialized');
    },
  };
  return { queryMockState: state };
});

let lastHandle: SdkStreamHandle | null = null;

function makeFakeQuery(): SdkStreamHandle {
  const { iterable, handle } = createControlledSdkStream();
  queryMockState.build = () => ({ iterable, handle });
  lastHandle = handle;
  return handle;
}

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createQueryControls } = await import('../../../../tests/mocks/claudeSdk');
  return {
    query: vi.fn(() => {
      const built = queryMockState.build();
      return Object.assign(built.iterable, createQueryControls());
    }),
  };
});

function initMessage(opts: {
  sessionId?: string;
  kpmStatus?: McpServerStatus['status'] | null;
  extraServers?: McpServerStatus[];
} = {}): SDKMessage {
  const mcpServers = [
    ...(opts.kpmStatus === null
      ? []
      : [{ name: 'kpm', status: opts.kpmStatus ?? 'connected' }]),
    ...(opts.extraServers ?? []),
  ];

  return {
    type: 'system',
    subtype: 'init',
    session_id: opts.sessionId ?? 'sdk-session-1',
    mcp_servers: mcpServers,
  } as unknown as SDKMessage;
}

function createConfig(overrides: Partial<StreamingSessionConfig> = {}): StreamingSessionConfig {
  return {
    sdkOptions: { systemPrompt: 'test' },
    onMessage: vi.fn(),
    onSessionEnd: vi.fn(),
    onReady: vi.fn(),
    onMcpError: vi.fn(),
    ...overrides,
  };
}

describe('StreamingSession', () => {
  beforeEach(() => {
    lastHandle = null;
  });

  it('rejects start() with an empty initial message', async () => {
    makeFakeQuery();
    const session = new StreamingSession(createConfig());
    await expect(session.start('')).rejects.toThrow(/initial message/i);
  });

  it('throws when start() is called twice', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage());
    await startPromise;

    await expect(session.start('again')).rejects.toThrow(/already started/);
  });

  it('marks the session ready and fires onReady when kpm MCP connects', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage({ sessionId: 'abc' }));
    await startPromise;

    expect(session.isActive()).toBe(true);
    expect(session.isReady()).toBe(true);
    expect(session.getSessionId()).toBe('abc');
    expect(config.onReady).toHaveBeenCalledWith('abc', [{ name: 'kpm', status: 'connected' }]);
    expect(config.onMcpError).not.toHaveBeenCalled();
  });

  it('rejects start() and fires onMcpError when kpm MCP fails', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage({ kpmStatus: 'failed' }));

    await expect(startPromise).rejects.toThrow(/MCP connection failed/);
    expect(config.onMcpError).toHaveBeenCalledTimes(1);
    expect(session.isReady()).toBe(false);
  });

  it.each(['pending', 'disabled', 'needs-auth'] as const)(
    'rejects start() when kpm MCP is %s',
    async (status) => {
      makeFakeQuery();
      const config = createConfig();
      const session = new StreamingSession(config);

      const startPromise = session.start('hello');
      lastHandle!.emit(initMessage({ kpmStatus: status }));

      await expect(startPromise).rejects.toThrow(new RegExp(`kpm \\(${status}\\)`));
      expect(config.onMcpError).toHaveBeenCalledWith([{ name: 'kpm', status }]);
      expect(session.isReady()).toBe(false);
    }
  );

  it('rejects start() when kpm MCP is missing from init status', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage({ kpmStatus: null }));

    await expect(startPromise).rejects.toThrow(/kpm \(missing\)/);
    expect(config.onMcpError).toHaveBeenCalledWith([]);
    expect(session.isReady()).toBe(false);
  });

  it('allows external MCP servers to be pending at init', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const externalServer = { name: 'slack', status: 'pending' } as McpServerStatus;
    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage({ extraServers: [externalServer] }));
    await startPromise;

    expect(session.isReady()).toBe(true);
    expect(config.onReady).toHaveBeenCalledWith('sdk-session-1', [
      { name: 'kpm', status: 'connected' },
      externalServer,
    ]);
    expect(config.onMcpError).not.toHaveBeenCalled();
  });

  it('forwards SDK messages received after init to onMessage', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage());
    await startPromise;

    const assistantMsg = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi' }] },
    } as unknown as SDKMessage;
    lastHandle!.emit(assistantMsg);

    // Allow microtasks for the message loop to dispatch.
    await new Promise((r) => setImmediate(r));

    expect(config.onMessage).toHaveBeenCalledWith(assistantMsg);
  });

  it('send() rejects before start, accepts after ready', async () => {
    makeFakeQuery();
    const session = new StreamingSession(createConfig());

    expect(() => session.send('early')).toThrow(/not ready/);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage());
    await startPromise;

    expect(() => session.send('ok')).not.toThrow();
  });

  it('emits onSessionEnd("completed") when the SDK generator exhausts normally', async () => {
    makeFakeQuery();
    const config = createConfig();
    const session = new StreamingSession(config);

    const startPromise = session.start('hello');
    lastHandle!.emit(initMessage());
    await startPromise;

    lastHandle!.end();
    await new Promise((r) => setImmediate(r));

    expect(config.onSessionEnd).toHaveBeenCalledWith('completed');
    expect(session.isActive()).toBe(false);
  });

  it('close() is idempotent on inactive sessions', async () => {
    const session = new StreamingSession(createConfig());
    await session.close();
    await session.close();
    expect(session.isActive()).toBe(false);
  });
});
