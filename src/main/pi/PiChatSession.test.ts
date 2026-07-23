import { describe, it, expect, vi } from 'vitest';
import type * as PiCodingAgent from '@earendil-works/pi-coding-agent';
import {
  PiChatSession,
  buildToolCallGate,
  parsePiModelSelector,
  resolvePiModelSelection,
  resolvePiProjectTrust,
  resolvePiSessionManager,
  type CreatePiSessionFn,
  type PiModelRuntimeHandle,
  type PiSessionHandle,
} from './PiChatSession';
import type { PlanContext } from '../chat/prompts';

vi.mock('../kpmTools/runtimeRegistry', () => ({
  executeKpmTool: vi.fn(),
  getKpmToolDefinitions: () => [],
  runWithToolExecutionContext: (_context: unknown, run: () => unknown) => run(),
}));

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

interface FakePiSession {
  handle: PiSessionHandle;
  emit: (event: unknown) => void;
  promptMock: ReturnType<typeof vi.fn>;
  abortMock: ReturnType<typeof vi.fn>;
}

function makeFakeSession(promptImpl?: (text: string) => void | Promise<void>): FakePiSession {
  const listeners: ((event: unknown) => void)[] = [];
  const abortMock = vi.fn().mockResolvedValue(undefined);
  const promptMock = vi.fn(async (text: string) => {
    await promptImpl?.(text);
  });
  const handle: PiSessionHandle = {
    getSessionId: () => 'pi-session-1',
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    prompt: promptMock,
    abort: abortMock,
  };
  return {
    handle,
    emit: (event: unknown) => {
      for (const listener of listeners) listener(event);
    },
    promptMock,
    abortMock,
  };
}

describe('PiChatSession', () => {
  it('persists a complete assistant text block at message_end from text_delta-only streaming', async () => {
    const fake = makeFakeSession((_text) => {
      fake.emit({
        type: 'message_update',
        message: {},
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello ', partial: {} },
      });
      fake.emit({
        type: 'message_update',
        message: {},
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'world', partial: {} },
      });
      fake.emit({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
          usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
        },
      });
      fake.emit({ type: 'agent_end', messages: [], willRetry: false });
    });

    const createSession: CreatePiSessionFn = async () => fake.handle;
    const onMessage = vi.fn();

    const session = new PiChatSession({
      context: makeContext(),
      onMessage,
      createSession,
    });

    await session.start('hi');

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' }));
    });

    const assistantTextEnvelopes = (onMessage.mock.calls as unknown[][])
      .map((call) => call[0] as { type?: string; message?: { content?: { type?: string; text?: string }[] } })
      .filter((message) => message.type === 'assistant' && message.message?.content?.[0]?.type === 'text');

    expect(assistantTextEnvelopes).toHaveLength(1);
    expect(assistantTextEnvelopes[0]?.message?.content?.[0]?.text).toBe('Hello world');

    expect(onMessage).toHaveBeenCalledWith({
      type: 'result',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      session_id: 'pi-session-1',
    });
  });

  it('interrupt() calls session.abort()', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({ type: 'agent_end', messages: [], willRetry: false });
    });
    const createSession: CreatePiSessionFn = async () => fake.handle;

    const session = new PiChatSession({
      context: makeContext(),
      onMessage: vi.fn(),
      createSession,
    });

    await session.start('hi');
    await session.interrupt();

    expect(fake.abortMock).toHaveBeenCalledTimes(1);
  });

  it('interrupt() does not tear down the session when prompt() rejects on abort', async () => {
    let rejectPrompt: ((error: Error) => void) | undefined;
    let promptCallCount = 0;
    const fake = makeFakeSession(() => {
      promptCallCount += 1;
      if (promptCallCount === 1) {
        // Simulate pi's real behavior: session.prompt() rejects once aborted.
        return new Promise<void>((_resolve, reject) => {
          rejectPrompt = reject;
        });
      }
      fake.emit({ type: 'agent_end', messages: [], willRetry: false });
      return Promise.resolve();
    });
    const abort = vi.fn(async () => {
      rejectPrompt?.(new Error('aborted by user'));
    });
    fake.handle.abort = abort;

    const createSession: CreatePiSessionFn = async () => fake.handle;
    const onMessage = vi.fn();
    const onSessionEnd = vi.fn();

    const session = new PiChatSession({
      context: makeContext(),
      onMessage,
      onSessionEnd,
      createSession,
    });

    await session.start('hi');
    await session.interrupt();

    expect(abort).toHaveBeenCalledTimes(1);

    // The session must stay usable for the next turn.
    session.send('follow up');

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' }));
    });

    expect(promptCallCount).toBe(2);
    expect(onSessionEnd).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('captures usage from turn_end when message_end did not carry it', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      });
      fake.emit({
        type: 'turn_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }],
          usage: { input: 42, output: 7, cacheRead: 1, cacheWrite: 2 },
        },
      });
      fake.emit({ type: 'agent_end', messages: [], willRetry: false });
    });

    const createSession: CreatePiSessionFn = async () => fake.handle;
    const onMessage = vi.fn();

    const session = new PiChatSession({ context: makeContext(), onMessage, createSession });

    await session.start('hi');

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith({
        type: 'result',
        usage: {
          input_tokens: 42,
          output_tokens: 7,
          cache_read_input_tokens: 1,
          cache_creation_input_tokens: 2,
        },
        session_id: 'pi-session-1',
      });
    });
  });

  it('does not clobber previously captured usage with an absent usage on a later message_end', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [],
          usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0 },
        },
      });
      fake.emit({
        // A later call within the same turn (e.g. an aborted/error tail call)
        // reports no usage at all — the earlier real usage must survive.
        type: 'message_end',
        message: { role: 'assistant', content: [] },
      });
      fake.emit({ type: 'agent_end', messages: [], willRetry: false });
    });

    const createSession: CreatePiSessionFn = async () => fake.handle;
    const onMessage = vi.fn();

    const session = new PiChatSession({ context: makeContext(), onMessage, createSession });

    await session.start('hi');

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith({
        type: 'result',
        usage: {
          input_tokens: 10,
          output_tokens: 3,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        session_id: 'pi-session-1',
      });
    });
  });

  it('falls back to the last assistant message in agent_end.messages when nothing else carried usage', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      });
      fake.emit({
        type: 'agent_end',
        messages: [
          { role: 'user', content: 'hi' },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi' }],
            usage: { input: 5, output: 1, cacheRead: 0, cacheWrite: 0 },
          },
        ],
        willRetry: false,
      });
    });

    const createSession: CreatePiSessionFn = async () => fake.handle;
    const onMessage = vi.fn();

    const session = new PiChatSession({ context: makeContext(), onMessage, createSession });

    await session.start('hi');

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith({
        type: 'result',
        usage: {
          input_tokens: 5,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        session_id: 'pi-session-1',
      });
    });
  });

  it('threads config.resumeSessionId into the session factory options', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({ type: 'agent_end', messages: [], willRetry: false });
    });
    const createSession = vi.fn(async (): Promise<PiSessionHandle> => fake.handle);

    const session = new PiChatSession({
      context: makeContext(),
      resumeSessionId: 'pi-session-existing',
      onMessage: vi.fn(),
      createSession,
    });

    await session.start('hi');

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ resumeSessionId: 'pi-session-existing' })
    );
  });
});

describe('resolvePiSessionManager', () => {
  it('creates a fresh persisted session when no resumeSessionId is given', async () => {
    const created = { kind: 'created' };
    const pi = {
      SessionManager: {
        create: vi.fn(() => created),
        list: vi.fn(),
        open: vi.fn(),
      },
    } as unknown as typeof PiCodingAgent;

    const result = await resolvePiSessionManager(pi, '/repo', undefined);

    expect(result).toBe(created);
    expect(pi.SessionManager.create).toHaveBeenCalledWith('/repo');
    expect(pi.SessionManager.list).not.toHaveBeenCalled();
  });

  it('opens the matching persisted session file when resumeSessionId is found', async () => {
    const opened = { kind: 'opened' };
    const pi = {
      SessionManager: {
        create: vi.fn(),
        list: vi.fn(async () => [
          { id: 'other', path: '/sessions/other.jsonl' },
          { id: 'target', path: '/sessions/target.jsonl' },
        ]),
        open: vi.fn(() => opened),
      },
    } as unknown as typeof PiCodingAgent;

    const result = await resolvePiSessionManager(pi, '/repo', 'target');

    expect(result).toBe(opened);
    expect(pi.SessionManager.open).toHaveBeenCalledWith('/sessions/target.jsonl', undefined, '/repo');
    expect(pi.SessionManager.create).not.toHaveBeenCalled();
  });

  it('falls back to a fresh session when resumeSessionId cannot be found', async () => {
    const created = { kind: 'created' };
    const pi = {
      SessionManager: {
        create: vi.fn(() => created),
        list: vi.fn(async () => []),
        open: vi.fn(),
      },
    } as unknown as typeof PiCodingAgent;

    const result = await resolvePiSessionManager(pi, '/repo', 'missing');

    expect(result).toBe(created);
    expect(pi.SessionManager.open).not.toHaveBeenCalled();
  });

  it('falls back to a fresh session when the session-file lookup throws', async () => {
    const created = { kind: 'created' };
    const pi = {
      SessionManager: {
        create: vi.fn(() => created),
        list: vi.fn(async () => {
          throw new Error('disk error');
        }),
        open: vi.fn(),
      },
    } as unknown as typeof PiCodingAgent;

    const result = await resolvePiSessionManager(pi, '/repo', 'target');

    expect(result).toBe(created);
    expect(pi.SessionManager.open).not.toHaveBeenCalled();
  });
});

describe('buildToolCallGate', () => {
  it('blocks tool names outside the allowlist (write, bash)', () => {
    const gate = buildToolCallGate(['read', 'grep', 'find', 'ls', 'modify_plan']);

    for (const toolName of ['write', 'bash', 'edit']) {
      const result = gate(toolName);
      expect(result?.block).toBe(true);
      expect(typeof result?.reason).toBe('string');
    }
  });

  it('allows read-only builtins and KPM tools in the allowlist', () => {
    const gate = buildToolCallGate(['read', 'grep', 'find', 'ls', 'modify_plan']);

    expect(gate('read')).toBeUndefined();
    expect(gate('grep')).toBeUndefined();
    expect(gate('modify_plan')).toBeUndefined();
  });
});

describe('resolvePiProjectTrust', () => {
  it('always resolves to false, regardless of what the pre-trust extension load reports', async () => {
    await expect(resolvePiProjectTrust()).resolves.toBe(false);
  });
});

describe('parsePiModelSelector', () => {
  it('splits provider and modelId on the first slash', () => {
    expect(parsePiModelSelector('openai-codex/gpt-5.4')).toEqual({ provider: 'openai-codex', modelId: 'gpt-5.4' });
  });

  it('returns undefined for a selector with no separator', () => {
    expect(parsePiModelSelector('gpt-5.4')).toBeUndefined();
  });

  it('returns undefined for an empty provider or modelId', () => {
    expect(parsePiModelSelector('/gpt-5.4')).toBeUndefined();
    expect(parsePiModelSelector('openai-codex/')).toBeUndefined();
  });
});

interface FakeModel {
  provider: string;
  id: string;
}

function makeFakeModelRuntime(models: FakeModel[]): PiModelRuntimeHandle<FakeModel> {
  return {
    getModel: (provider, modelId) => models.find((model) => model.provider === provider && model.id === modelId),
    getAvailable: async () => models,
  };
}

describe('resolvePiModelSelection', () => {
  it('resolves the exact model when the provider/modelId selector matches', async () => {
    const runtime = makeFakeModelRuntime([
      { provider: 'cursor', id: 'auto' },
      { provider: 'cursor', id: 'opus-latest@1m' },
    ]);

    await expect(resolvePiModelSelection(runtime, { provider: 'cursor', modelId: 'opus-latest@1m' })).resolves.toEqual({
      model: { provider: 'cursor', id: 'opus-latest@1m' },
      usedFallback: false,
    });
  });

  it('falls back to another available model for the same provider when the exact modelId misses', async () => {
    // listPiProviders() enumerated a placeholder/stale id (e.g. cursor's guessed
    // "auto") that the live ModelRuntime never actually registered under that
    // exact id — the provider itself is still real and available.
    const runtime = makeFakeModelRuntime([{ provider: 'cursor', id: 'opus-latest@1m' }]);

    await expect(resolvePiModelSelection(runtime, { provider: 'cursor', modelId: 'auto' })).resolves.toEqual({
      model: { provider: 'cursor', id: 'opus-latest@1m' },
      usedFallback: true,
    });
  });

  it('returns undefined when the provider has no available model at all', async () => {
    const runtime = makeFakeModelRuntime([{ provider: 'openai-codex', id: 'gpt-5.4' }]);

    await expect(resolvePiModelSelection(runtime, { provider: 'cursor', modelId: 'auto' })).resolves.toBeUndefined();
  });
});
