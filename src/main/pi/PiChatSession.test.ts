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
  type PiWriteConsentFn,
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

  it('emits one result after prompt settlement when agent_end retries', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({
        type: 'agent_end',
        messages: [{ role: 'assistant', content: [], usage: { input: 4, output: 1, cacheRead: 0, cacheWrite: 0 } }],
        willRetry: true,
      });
      fake.emit({
        type: 'agent_end',
        messages: [{ role: 'assistant', content: [], usage: { input: 6, output: 2, cacheRead: 0, cacheWrite: 0 } }],
        willRetry: false,
      });
    });
    const onMessage = vi.fn();
    const session = new PiChatSession({
      context: makeContext(),
      onMessage,
      createSession: async () => fake.handle,
    });

    await session.start('hi');
    await waitFor(() => {
      const resultMessages = (onMessage.mock.calls as unknown[][])
        .filter((call) => (call[0] as { type?: unknown }).type === 'result');
      expect(resultMessages).toHaveLength(1);
    });

    expect(onMessage).toHaveBeenCalledWith({
      type: 'result',
      usage: {
        input_tokens: 6,
        output_tokens: 2,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      session_id: 'pi-session-1',
    });
  });

  it('labels its cost per-turn, because pi reports what this turn spent', async () => {
    const fake = makeFakeSession(() => {
      fake.emit({
        type: 'agent_end',
        messages: [{
          role: 'assistant',
          content: [],
          usage: { input: 6, output: 2, cacheRead: 0, cacheWrite: 0, cost: { total: 0.12 } },
        }],
        willRetry: false,
      });
    });
    const onMessage = vi.fn();
    const session = new PiChatSession({
      context: makeContext(),
      onMessage,
      createSession: async () => fake.handle,
    });

    await session.start('hi');
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result' }));
    });

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      cost: { usd: 0.12, basis: 'per-turn' },
    }));
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
  const readOnly = ['read', 'grep', 'find', 'ls', 'modify_plan'];
  const withWrites = [...readOnly, 'write', 'edit', 'bash'];
  const allow: PiWriteConsentFn = async () => ({ allowed: true });

  it('blocks tool names outside the allowlist', async () => {
    const gate = buildToolCallGate(readOnly);

    for (const toolName of ['write', 'bash', 'edit']) {
      const result = await gate({ toolName, input: {} });
      expect(result?.block).toBe(true);
      expect(typeof result?.reason).toBe('string');
    }
  });

  it('allows read-only builtins and KPM tools in the allowlist', async () => {
    const gate = buildToolCallGate(readOnly);

    await expect(gate({ toolName: 'read', input: {} })).resolves.toBeUndefined();
    await expect(gate({ toolName: 'grep', input: {} })).resolves.toBeUndefined();
    await expect(gate({ toolName: 'modify_plan', input: {} })).resolves.toBeUndefined();
  });

  it('allows the MCP gateway without the write grant, and still blocks other extension tools', async () => {
    // `mcp` reaches external services rather than the repo, so it is not a
    // write builtin. Other tools the user's pi extensions register stay out.
    const gate = buildToolCallGate([...readOnly, 'mcp']);

    await expect(gate({ toolName: 'mcp', input: { search: 'issue' } })).resolves.toBeUndefined();
    expect((await gate({ toolName: 'cursor_agent', input: {} }))?.block).toBe(true);
    expect((await gate({ toolName: 'hypa_rewrite', input: {} }))?.block).toBe(true);
  });

  it('blocks an allowlisted write tool when no consent function is wired', async () => {
    const gate = buildToolCallGate(withWrites);

    const result = await gate({ toolName: 'write', input: { path: '/repos/my-app/a.ts' } });

    expect(result?.block).toBe(true);
  });

  it('routes write, edit, and bash through conversation consent', async () => {
    const requestConsent = vi.fn<PiWriteConsentFn>(allow);
    const gate = buildToolCallGate(withWrites, requestConsent);

    await gate({ toolName: 'write', input: { path: '/repos/my-app/a.ts' } });
    await gate({ toolName: 'edit', input: { path: '/repos/my-app/b.ts' } });
    await gate({ toolName: 'bash', input: { command: 'rm -rf build' } });

    expect(requestConsent).toHaveBeenCalledTimes(3);
    for (const call of requestConsent.mock.calls) {
      expect(call).toEqual([]);
    }
  });

  it('does not ask consent for read-only git in bash', async () => {
    const requestConsent = vi.fn<PiWriteConsentFn>(allow);
    const gate = buildToolCallGate(withWrites, requestConsent);

    const readResult = await gate({ toolName: 'bash', input: { command: 'git status --short' } });
    const writeResult = await gate({ toolName: 'bash', input: { command: 'git commit -m x' } });

    expect(readResult).toBeUndefined();
    expect(writeResult).toBeUndefined();
    expect(requestConsent).toHaveBeenCalledTimes(1);
  });

  it('does not ask consent for read-only builtins', async () => {
    const requestConsent = vi.fn<PiWriteConsentFn>(allow);
    const gate = buildToolCallGate(withWrites, requestConsent);

    await gate({ toolName: 'read', input: { path: '/repos/my-app/a.ts' } });
    await gate({ toolName: 'grep', input: { pattern: 'TODO' } });

    expect(requestConsent).not.toHaveBeenCalled();
  });

  it('blocks with the consent layer reason when the user declines', async () => {
    const gate = buildToolCallGate(withWrites, async () => ({ allowed: false, reason: 'user said no' }));

    const result = await gate({ toolName: 'write', input: { path: '/repos/my-app/a.ts' } });

    expect(result).toEqual({ block: true, reason: 'user said no' });
  });

  it('allows the write once consent is granted', async () => {
    const gate = buildToolCallGate(withWrites, allow);

    await expect(gate({ toolName: 'write', input: { path: '/repos/my-app/a.ts' } })).resolves.toBeUndefined();
  });

  it('blocks protected paths before write consent and marks recursive tools as traversal', async () => {
    const requestConsent = vi.fn<PiWriteConsentFn>(allow);
    const pathIsProtected = vi.fn(async (targetPath: string) => (
      targetPath === '.' || targetPath.includes('credentials')
    ));
    const gate = buildToolCallGate(withWrites, requestConsent, pathIsProtected);

    await expect(
      gate({ toolName: 'write', input: { path: '/protected/credentials/token' } }),
    ).resolves.toMatchObject({ block: true });
    await expect(
      gate({ toolName: 'find', input: {} }),
    ).resolves.toMatchObject({ block: true });

    expect(requestConsent).not.toHaveBeenCalled();
    expect(pathIsProtected).toHaveBeenNthCalledWith(1, '/protected/credentials/token', false);
    expect(pathIsProtected).toHaveBeenNthCalledWith(2, '.', true);
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

  it('does not substitute another model when the exact modelId misses', async () => {
    const runtime = makeFakeModelRuntime([{ provider: 'cursor', id: 'opus-latest@1m' }]);

    await expect(resolvePiModelSelection(runtime, { provider: 'cursor', modelId: 'auto' })).resolves.toBeUndefined();
  });

  it('returns undefined when the provider has no available model at all', async () => {
    const runtime = makeFakeModelRuntime([{ provider: 'openai-codex', id: 'gpt-5.4' }]);

    await expect(resolvePiModelSelection(runtime, { provider: 'cursor', modelId: 'auto' })).resolves.toBeUndefined();
  });
});
