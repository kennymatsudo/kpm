/**
 * StreamingSession unit tests.
 *
 * Drives the SUT through real lifecycle flows by feeding controlled SDK
 * messages from a fake `query()` implementation, then asserts on the
 * resulting public state and callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamingSession, type StreamingSessionConfig } from './StreamingSession';

interface QueryMockState {
  build: () => {
    iterable: AsyncIterable<SDKMessage>;
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


  lastHandle = handle;
  return handle;
}


  return {
    type: 'system',
    subtype: 'init',
    session_id: opts.sessionId ?? 'sdk-session-1',
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
