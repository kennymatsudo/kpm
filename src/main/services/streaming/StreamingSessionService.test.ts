import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type {
  PlanActionsEvent,
} from '../../claude/tools/createKpmServer';
import {
  createStreamingSessionService,
  type StreamingSessionServiceDeps,
} from './StreamingSessionService';

  mockSessionInstances: [] as {
    emitMessage: (msg: unknown) => void;
    emitSessionEnd: (reason: 'completed' | 'error' | 'closed', error?: Error) => void;
    setReady: (value: boolean) => void;
    sentMessages: string[];
    interruptCallCount: { value: number };
  }[],
  mockSessionCounter: { nextId: 1 },
}));

const { sdkTypeGuardState } = vi.hoisted(() => ({
  sdkTypeGuardState: {
    maxTokensReached: false,
    maxTurnsReached: false,
    apiRetry: false,
  },
}));

vi.mock('../../claude/streaming', () => {
  type SessionEndReason = 'completed' | 'error' | 'closed';
  interface MockSessionConfig {
    onMessage: (msg: unknown) => void;
    onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
    onReady?: (sessionId: string, mcpStatus: unknown[]) => void;
  }

  class MockStreamingSession {
    private readonly config: MockSessionConfig;
    private ready = true;
    readonly sentMessages: string[] = [];
    readonly interruptCallCount = { value: 0 };

    constructor(config: MockSessionConfig) {
      this.config = config;
      mockSessionInstances.push(this);
    }

    async start(initialMessage: string): Promise<void> {
      this.sentMessages.push(initialMessage);
      const sessionId = `mock-session-${mockSessionCounter.nextId++}`;
      this.config.onReady?.(sessionId, []);
    }

    send(text: string): void {
      if (!this.ready) {
        throw new Error('Session is not ready');
      }
      this.sentMessages.push(text);
    }

    isReady(): boolean {
      return this.ready;
    }

    async interrupt(): Promise<void> {
      this.interruptCallCount.value += 1;
      return Promise.resolve();
    }

    async close(): Promise<void> {
      this.ready = false;
      this.config.onSessionEnd?.('closed');
    }

    emitMessage(msg: unknown): void {
      this.config.onMessage(msg);
    }

    emitSessionEnd(reason: SessionEndReason, error?: Error): void {
      this.ready = false;
      this.config.onSessionEnd?.(reason, error);
    }

    setReady(value: boolean): void {
      this.ready = value;
    }
  }

  return {
    StreamingSession: MockStreamingSession,
  };
});

vi.mock('../../claude/tools/createKpmServer', () => ({
  runWithToolExecutionContext: (_context: unknown, run: () => unknown) => run(),
}));

vi.mock('../../claude/clientManager', () => ({
  clientManager: {
    clearAllowAllRemaining: vi.fn(),
  },
}));


vi.mock('../../config', () => ({
  getConfig: () => ({
    session: {
      sessionReadyTimeoutMs: 1_000,
      cleanupIntervalMs: 60_000,
      processingIdleTimeoutMs: 60_000,
      processingTimeoutMs: 300_000,
      mainIdleTimeoutMs: 60_000,
    },
  }),
}));

function createDeps(sendSpy: (channel: string, payload: unknown) => void): StreamingSessionServiceDeps {

  return {
    projectRepository: {
      get: () => ({ id: 'project-1' } as never),
      updateTokens: vi.fn(),
    },
    chatMessageRepository: {
      addMessage: vi.fn(),
    },
    chatSessionRepository: {
      get: (id: string) => chatSessions.get(id),
      create: (id: string) => {
        return { id };
      },
      updateClaudeSessionId: (id: string, claudeSessionId: string) => {
      },
    },
    getMainWindow: () => ({
      webContents: {
        send: sendSpy,
      },
    } as BrowserWindow),
    buildContext: () => ({ projectId: 'project-1' } as never),
    subscribeToPlanActions: () => () => {},
    subscribeToClaudeMdUpdate: () => () => {},
    subscribeToDocumentUpdate: () => () => {},
    readClaudeMd: async () => ({ success: true, content: '', filename: 'AGENTS.md' }),
    readDocumentFile: async () => ({ success: true, content: '' }),
  };
}

function createDepsWithToolEvents(sendSpy: (channel: string, payload: unknown) => void) {
  const planActionSubscribers: ((event: PlanActionsEvent) => void)[] = [];

  const deps = createDeps(sendSpy);
  const depsWithEvents: StreamingSessionServiceDeps = {
    ...deps,
    subscribeToPlanActions: (callback) => {
      planActionSubscribers.push(callback);
      return () => {
        const index = planActionSubscribers.indexOf(callback);
        if (index !== -1) planActionSubscribers.splice(index, 1);
      };
    },
    subscribeToClaudeMdUpdate: (callback) => {
      contextFileSubscribers.push(callback);
      return () => {
        const index = contextFileSubscribers.indexOf(callback);
        if (index !== -1) contextFileSubscribers.splice(index, 1);
      };
    },
  };

  return {
    deps: depsWithEvents,
    emitPlanActions: (event: PlanActionsEvent) => {
      for (const callback of planActionSubscribers) callback(event);
    },
      for (const callback of contextFileSubscribers) callback(update);
    },
  };
}

describe('StreamingSessionService lifecycle regression coverage', () => {
  let service: ReturnType<typeof createStreamingSessionService> | null = null;
  const sentEvents: { channel: string; payload: unknown }[] = [];
  const sendSpy = vi.fn((channel: string, payload: unknown) => {
    sentEvents.push({ channel, payload });
  });

  beforeEach(() => {
    sentEvents.length = 0;
    mockSessionInstances.length = 0;
    mockSessionCounter.nextId = 1;
    sdkTypeGuardState.maxTokensReached = false;
    sdkTypeGuardState.maxTurnsReached = false;
    sdkTypeGuardState.apiRetry = false;
    sendSpy.mockClear();
  });

  afterEach(async () => {
    if (service) {
      await service.disposeAll();
    }
    service = null;
    sentEvents.length = 0;
    mockSessionInstances.length = 0;
  });

  it('suppresses redundant session-deactivated after a finalized turn', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitMessage({ type: 'result' });
    expect(sentEvents.some((e) => e.channel === 'chat:done')).toBe(true);

    sentEvents.length = 0;
    session.emitSessionEnd('error', new Error('post-turn teardown'));

    expect(sentEvents.some((e) => e.channel === 'chat:session-deactivated')).toBe(false);
    expect(sentEvents.some((e) => e.channel === 'chat:done')).toBe(false);
    expect(service.getActiveSessions('project-1')).toHaveLength(0);
  });

  it('still emits deactivation and done when a session ends mid-turn', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitSessionEnd('error', new Error('stream failed'));

    const deactivation = sentEvents.find((e) => e.channel === 'chat:session-deactivated');
    expect(deactivation).toBeDefined();
    expect(deactivation?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      reason: 'session_end_error',
      source: 'onSessionEnd',
      previousState: 'processing',
    });
    expect(sentEvents.some((e) => e.channel === 'chat:done')).toBe(true);
  });

  it('reconnects silently when underlying session is not ready', async () => {
    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);

    const firstSession = mockSessionInstances[0];
    firstSession.emitMessage({ type: 'result' });
    firstSession.setReady(false);

    sentEvents.length = 0;
    const secondSend = await service.sendChatMessage('project-1', 'follow up', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(secondSend.ok).toBe(true);

    expect(mockSessionInstances).toHaveLength(2);
    expect(sentEvents.some((e) => e.channel === 'chat:session-deactivated')).toBe(false);
  });

  it('routes tool approval events only to their originating chat session', async () => {
    const toolEvents = createDepsWithToolEvents(sendSpy);
    service = createStreamingSessionService(toolEvents.deps);

    const firstSend = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    const secondSend = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-2',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);
    expect(secondSend.ok).toBe(true);

    sentEvents.length = 0;

    const actions: PlanAction[] = [{ type: 'delete_item', item_id: 'item-1' }];
    toolEvents.emitPlanActions({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      actions,
    });

    const planActionEvents = sentEvents.filter((event) => event.channel === 'chat:plan-actions');

    expect(planActionEvents).toHaveLength(1);
    expect(planActionEvents[0]?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      actions,
    });
  });

    const toolEvents = createDepsWithToolEvents(sendSpy);
    service = createStreamingSessionService(toolEvents.deps);

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    sentEvents.length = 0;
    toolEvents.emitContextFileUpdate({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      newContent: '# Updated context',
    });
    await Promise.resolve();

    const fileUpdate = sentEvents.find((event) => event.channel === 'chat:file-update');
    expect(fileUpdate?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      filePath: 'CLAUDE.md',
      content: '# Updated context',
      oldContent: '# Existing context',
    });
  });

    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);
    // Initial message was delivered via start(), session is now processing.
    expect(mockSessionInstances).toHaveLength(1);
    const session = mockSessionInstances[0];
    expect(session.sentMessages).toEqual(['first prompt']);

      chatSessionId: 'chat-1',
      model: 'sonnet',
    });

    expect(secondSend.ok).toBe(true);
    expect(session.sentMessages).toEqual(['first prompt', 'second prompt']);

    expect(mockSessionInstances).toHaveLength(1);
  });

    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);

    const session = mockSessionInstances[0];

      chatSessionId: 'chat-1',
      model: 'sonnet',
    });

      chatSessionId: 'chat-1',
    });
  });

    service = createStreamingSessionService(createDeps(sendSpy));

    const firstSend = await service.sendChatMessage('project-1', 'first prompt', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(firstSend.ok).toBe(true);

    const session = mockSessionInstances[0];
    sentEvents.length = 0;

      chatSessionId: 'chat-1',
      model: 'sonnet',
    });

    session.emitMessage({
      type: 'assistant',
    });
  });

it('surfaces max-token truncation after finalizing the partial response', async () => {
    sdkTypeGuardState.maxTokensReached = true;
    service = createStreamingSessionService(createDeps(sendSpy));

    const sendResult = await service.sendChatMessage('project-1', 'hello', {
      chatSessionId: 'chat-1',
      model: 'sonnet',
    });
    expect(sendResult.ok).toBe(true);

    const session = mockSessionInstances[0];
    expect(session).toBeDefined();

    sentEvents.length = 0;
    session.emitMessage({ type: 'result' });

    const doneIndex = sentEvents.findIndex((event) => event.channel === 'chat:done');
    const errorIndex = sentEvents.findIndex((event) => event.channel === 'chat:error');

    expect(doneIndex).toBeGreaterThanOrEqual(0);
    expect(errorIndex).toBeGreaterThan(doneIndex);
    expect(sentEvents[errorIndex]?.payload).toMatchObject({
      projectId: 'project-1',
      chatSessionId: 'chat-1',
      error: 'Response reached the output limit. Send another message to continue.',
    });
  });
});
