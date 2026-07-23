import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionState, AgentSessionUsage } from '../../../shared/agent-types';
import {
  PiSdkAgentSession,
  type CreatePiBoardSessionOptions,
  type PiBoardSessionHandle,
} from './PiSdkAgentSession';

interface FakePiSession {
  handle: PiBoardSessionHandle;
  emit(event: unknown): void;
  prompts: string[];
  finishPrompt(): void;
  addUsage(input: number, output: number, cost: number): void;
}

function createFakePiSession(): FakePiSession {
  let listener: ((event: unknown) => void) | null = null;
  let finish: (() => void) | null = null;
  let stats = {
    sessionId: 'pi-session-1',
    tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1 },
    cost: 0.1,
  };
  const prompts: string[] = [];
  return {
    prompts,
    handle: {
      subscribe: (next) => {
        listener = next;
        return () => { listener = null; };
      },
      prompt: (text) => {
        prompts.push(text);
        return new Promise<void>((resolve) => { finish = resolve; });
      },
      abort: vi.fn(async () => { finish?.(); }),
      dispose: vi.fn(),
      getSessionStats: () => stats,
      getModel: () => 'openai/gpt-5.6-sol',
    },
    emit: (event) => listener?.(event),
    finishPrompt: () => finish?.(),
    addUsage: (input, output, cost) => {
      stats = {
        ...stats,
        tokens: {
          ...stats.tokens,
          input: stats.tokens.input + input,
          output: stats.tokens.output + output,
        },
        cost: stats.cost + cost,
      };
    },
  };
}

function assistantMessage(text: string): unknown {
  return {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
      usage: { input: 3, output: 2, cacheRead: 0, cacheWrite: 0 },
    },
  };
}

async function waitForState(session: PiSdkAgentSession, state: AgentSessionState): Promise<void> {
  await vi.waitFor(() => expect(session.state).toBe(state));
}

describe('PiSdkAgentSession', () => {
  it('runs an implementation turn with the selected Pi model and records usage', async () => {
    const fake = createFakePiSession();
    let options: CreatePiBoardSessionOptions | undefined;
    const createSession = vi.fn(async (input: CreatePiBoardSessionOptions) => {
      options = input;
      return fake.handle;
    });
    const session = new PiSdkAgentSession({
      id: 'dev-1',
      role: 'implement',
      systemPrompt: 'Implement carefully.',
      model: 'openai/gpt-5.6-sol',
      effort: 'high',
      createSession,
    });
    const usage: AgentSessionUsage[] = [];
    session.on('onUsage', (event) => usage.push(event));

    await session.start('/tmp/worktree', 'Build the feature');
    expect(options).toEqual({
      cwd: '/tmp/worktree',
      systemPrompt: 'Implement carefully.',
      model: 'openai/gpt-5.6-sol',
      effort: 'high',
      readOnly: false,
    });
    expect(session.state).toBe('working');

    fake.emit(assistantMessage('Implemented the feature.'));
    fake.addUsage(20, 8, 0.25);
    fake.finishPrompt();
    await waitForState(session, 'complete');

    expect(session.getResult()).toEqual({ finalText: 'Implemented the feature.' });
    expect(usage).toEqual([expect.objectContaining({
      model: 'openai/gpt-5.6-sol',
      inputTokens: 20,
      outputTokens: 8,
      sdkSessionId: 'pi-session-1',
    })]);
    expect(usage[0].totalCostUsd).toBeCloseTo(0.25);
  });

  it('parses Pi review findings and creates review sessions as read-only', async () => {
    const fake = createFakePiSession();
    const createSession = vi.fn(async () => fake.handle);
    const session = new PiSdkAgentSession({
      id: 'review-1',
      role: 'review',
      systemPrompt: 'Review carefully.',
      model: 'anthropic/claude-sonnet-4-5',
      createSession,
    });

    await session.start('/tmp/worktree', 'Review the diff');
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
    fake.emit(assistantMessage('{"findings":[{"severity":"warning","description":"Handle null input."}]}'));
    fake.finishPrompt();
    await waitForState(session, 'complete');

    expect(session.getResult()).toEqual({
      finalText: '{"findings":[{"severity":"warning","description":"Handle null input."}]}',
      review: {
        findings: [{
          severity: 'warning',
          description: 'Handle null input.',
          agent: 'pi',
          source: 'agent',
        }],
      },
      reviewRawOutput: '{"findings":[{"severity":"warning","description":"Handle null input."}]}',
    });
    await expect(session.followUp('Review again')).rejects.toThrow('Pi review sessions are one-shot');
  });

  it('reuses the Pi session for implementation follow-ups', async () => {
    const fake = createFakePiSession();
    const session = new PiSdkAgentSession({
      id: 'dev-1',
      role: 'implement',
      systemPrompt: 'Implement carefully.',
      createSession: async () => fake.handle,
    });

    await session.start('/tmp/worktree', 'First turn');
    fake.emit(assistantMessage('First result'));
    fake.finishPrompt();
    await waitForState(session, 'complete');

    await session.followUp('Address the review');
    expect(session.state).toBe('working');
    fake.emit(assistantMessage('Addressed the review'));
    fake.finishPrompt();
    await waitForState(session, 'complete');

    expect(fake.prompts).toEqual(['First turn', 'Address the review']);
    expect(session.getResult()).toEqual({ finalText: 'Addressed the review' });
  });
});
