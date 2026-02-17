import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import {
  createStreamingSessionService,
  type StreamingSessionServiceDeps,
} from './StreamingSessionService';

    emitMessage: (msg: unknown) => void;
    emitSessionEnd: (reason: 'completed' | 'error' | 'closed', error?: Error) => void;
    setReady: (value: boolean) => void;
  mockSessionCounter: { nextId: 1 },
}));

vi.mock('../../claude/streaming', () => {
  type SessionEndReason = 'completed' | 'error' | 'closed';
    onMessage: (msg: unknown) => void;
    onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;
    onReady?: (sessionId: string, mcpStatus: unknown[]) => void;

  class MockStreamingSession {
    private readonly config: MockSessionConfig;
    private ready = true;

    constructor(config: MockSessionConfig) {
      this.config = config;
      mockSessionInstances.push(this);
    }

      const sessionId = `mock-session-${mockSessionCounter.nextId++}`;
      this.config.onReady?.(sessionId, []);
    }

      if (!this.ready) {
        throw new Error('Session is not ready');
      }
    }

    isReady(): boolean {
      return this.ready;
    }

    async interrupt(): Promise<void> {
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
    readDocumentFile: async () => ({ success: true, content: '' }),
  };
}

describe('StreamingSessionService lifecycle regression coverage', () => {
  let service: ReturnType<typeof createStreamingSessionService> | null = null;
  const sendSpy = vi.fn((channel: string, payload: unknown) => {
    sentEvents.push({ channel, payload });
  });

  beforeEach(() => {
    sentEvents.length = 0;
    mockSessionInstances.length = 0;
    mockSessionCounter.nextId = 1;
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
});
