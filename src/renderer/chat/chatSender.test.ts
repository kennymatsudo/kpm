import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createChatSender,
  type ChatSenderDeps,
  type ChatSenderStoreView,
  type ChatSendOutcome,
} from './chatSender';
import type { PerSessionState } from '../stores/chat/types';
import type { ChatChoiceView, FocusedResource } from '../../shared/types';

const PROJECT_ID = 'project-1';
const SESSION_ID = 'session-1';
const CLIENT_MESSAGE_ID = 'client-message-1';

function makeChoice(send: ChatChoiceView['send'] = { allowed: true }): ChatChoiceView {
  return {
    revision: 1,
    selected: { provider: 'claude', model: 'claude-sonnet-4-6', effort: null },
    remembered: {
      claude: { model: 'claude-sonnet-4-6', effort: null },
      codex: { model: 'gpt-5-codex', effort: null },
      pi: { model: 'anthropic/claude-sonnet-4-6', effort: null },
    },
    providers: [],
    controlsEnabled: true,
    responding: false,
    send,
  };
}

function makeSession(overrides: Partial<PerSessionState> = {}): PerSessionState {
  return {
    messages: [],
    backgroundTasks: [],
    streamingSegments: [],
    streamingContent: '',
    pendingActivities: [],
    isStreaming: false,
    error: null,
    activities: [],
    sessionState: 'ready',
    streamingThinking: '',
    streamStartedAt: null,
    lastStreamUpdateAt: null,
    draftMessage: '',
    pendingAttachments: [],
    suggestions: [],
    sessionNumber: 1,
    choice: makeChoice(),
    title: null,
    claudeSessionId: null,
    mcpDegraded: false,
    mcpError: null,
    hydrated: true,
    lastTurnUsage: null,
    ...overrides,
  };
}

function makeChatState(
  session: PerSessionState = makeSession(),
  overrides: Partial<ChatSenderStoreView> = {},
): ChatSenderStoreView {
  return {
    sessions: new Map([[SESSION_ID, session]]),
    viewedSessionId: SESSION_ID,
    getChatSessionId: vi.fn(() => SESSION_ID),
    getOrCreateSession: vi.fn(() => session),
    openChatChoice: vi.fn(async () => makeChoice()),
    addUserMessage: vi.fn(),
    withdrawFollowUp: vi.fn(),
    markFollowUpDelivered: vi.fn(),
    finalizeMessage: vi.fn(),
    setRetrying: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };
}

const FOCUSED_RESOURCES: FocusedResource[] = [{ type: 'document', id: 'doc-1', title: 'plan.md', path: '/docs/plan.md' }];

function makeDeps(chatState: ChatSenderStoreView, overrides: Partial<ChatSenderDeps> = {}) {
  const services = {
    sendChatMessage: vi.fn(async (): Promise<ChatSendOutcome> => ({ success: true })),
    cancelChatSession: vi.fn(async () => ({ success: true })),
    cancelQueuedChatMessage: vi.fn(async (): Promise<ChatSendOutcome> => ({ success: true })),
  };
  const deps: ChatSenderDeps = {
    projectId: PROJECT_ID,
    currentView: 'workspace',
    getChatState: () => chatState,
    getFocusedResources: vi.fn(() => FOCUSED_RESOURCES),
    services,
    ...overrides,
  };
  return { deps, services };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('send', () => {
  it('sends immediately and adds an unqueued bubble when no turn is in flight', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);

    const clientMessageId = await createChatSender(deps).send('hello', undefined, CLIENT_MESSAGE_ID);

    expect(clientMessageId).toBe(CLIENT_MESSAGE_ID);
    expect(chatState.addUserMessage).toHaveBeenCalledWith(SESSION_ID, 'hello', undefined, {
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(services.sendChatMessage).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      message: 'hello',
      focusedResources: FOCUSED_RESOURCES,
      tempImages: undefined,
      chatSessionId: SESSION_ID,
      currentView: 'workspace',
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(chatState.setError).not.toHaveBeenCalled();
  });

  it('queues the bubble behind a turn that is still streaming', async () => {
    const chatState = makeChatState(makeSession({ isStreaming: true }));
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).send('follow-up', undefined, CLIENT_MESSAGE_ID);

    expect(chatState.addUserMessage).toHaveBeenCalledWith(SESSION_ID, 'follow-up', undefined, {
      followUp: 'awaiting',
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(services.sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('resolves the chat session itself when no target session is given', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).send('hello');

    expect(chatState.getChatSessionId).toHaveBeenCalled();
    expect(services.sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatSessionId: SESSION_ID }),
    );
  });

  it('mints a client message id when the caller does not supply one', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);

    const clientMessageId = await createChatSender(deps).send('hello');

    expect(clientMessageId).toEqual(expect.any(String));
    expect(services.sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ clientMessageId }),
    );
  });

  it('passes attachment paths as temp images', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).send('look', [{ kind: 'image', path: '/tmp/shot.png', filename: 'shot.png', mediaType: 'image/png' }]);

    expect(services.sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tempImages: ['/tmp/shot.png'] }),
    );
  });
});

describe('rollback', () => {
  it('pulls the queued bubble back out and reports why when the backend refuses it', async () => {
    const chatState = makeChatState(makeSession({ isStreaming: true }));
    const { deps, services } = makeDeps(chatState);
    services.sendChatMessage.mockResolvedValue({ success: false, error: 'Session is shutting down' });

    await createChatSender(deps).send('follow-up', undefined, CLIENT_MESSAGE_ID);

    expect(chatState.withdrawFollowUp).toHaveBeenCalledWith(SESSION_ID, CLIENT_MESSAGE_ID);
    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'Session is shutting down');
  });

  it('keeps the bubble and reports the error when a fresh send is refused', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);
    services.sendChatMessage.mockResolvedValue({ success: false, error: 'No such repo' });

    await createChatSender(deps).send('hello', undefined, CLIENT_MESSAGE_ID);

    expect(chatState.withdrawFollowUp).not.toHaveBeenCalled();
    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'No such repo');
  });

  it('reports a thrown send instead of rejecting', async () => {
    const chatState = makeChatState(makeSession({ isStreaming: true }));
    const { deps, services } = makeDeps(chatState);
    services.sendChatMessage.mockRejectedValue(new Error('IPC channel closed'));

    const clientMessageId = await createChatSender(deps).send('follow-up', undefined, CLIENT_MESSAGE_ID);

    expect(clientMessageId).toBe(CLIENT_MESSAGE_ID);
    expect(chatState.withdrawFollowUp).toHaveBeenCalledWith(SESSION_ID, CLIENT_MESSAGE_ID);
    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'IPC channel closed');
  });
});

describe('choice gate', () => {
  it('blocks the send and reports the reason when the chosen model cannot send', async () => {
    const chatState = makeChatState(makeSession({
      choice: makeChoice({ allowed: false, reason: 'Model no longer available' }),
    }));
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).send('hello', undefined, CLIENT_MESSAGE_ID);

    expect(services.sendChatMessage).not.toHaveBeenCalled();
    expect(chatState.addUserMessage).not.toHaveBeenCalled();
    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'Model no longer available');
  });

  it('opens the choice first when the session has none yet', async () => {
    const withoutChoice = makeSession({ choice: null });
    const chatState = makeChatState(withoutChoice);
    chatState.openChatChoice = vi.fn(async () => {
      chatState.sessions.set(SESSION_ID, makeSession());
      return makeChoice();
    });
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).send('hello', undefined, CLIENT_MESSAGE_ID);

    expect(chatState.openChatChoice).toHaveBeenCalledWith(PROJECT_ID, SESSION_ID);
    expect(services.sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the choice still cannot be resolved', async () => {
    const chatState = makeChatState(makeSession({ choice: null }));
    chatState.openChatChoice = vi.fn(async () => null);
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).send('hello', undefined, CLIENT_MESSAGE_ID);

    expect(services.sendChatMessage).not.toHaveBeenCalled();
    expect(chatState.setError).not.toHaveBeenCalled();
  });
});

describe('retry', () => {
  it('re-sends the same message without adding a second bubble', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).retry('hello', CLIENT_MESSAGE_ID, ['/tmp/shot.png']);

    expect(chatState.addUserMessage).not.toHaveBeenCalled();
    expect(chatState.setRetrying).toHaveBeenCalledWith(SESSION_ID);
    expect(services.sendChatMessage).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      message: 'hello',
      focusedResources: FOCUSED_RESOURCES,
      tempImages: ['/tmp/shot.png'],
      chatSessionId: SESSION_ID,
      currentView: 'workspace',
      clientMessageId: CLIENT_MESSAGE_ID,
    });
  });

  it('runs the same preamble as send: session resolution, choice gate, session-scoped context', async () => {
    const chatState = makeChatState(makeSession({
      choice: makeChoice({ allowed: false, reason: 'Model no longer available' }),
    }));
    const { deps, services } = makeDeps(chatState);

    await createChatSender(deps).retry('hello', CLIENT_MESSAGE_ID);

    expect(chatState.getOrCreateSession).toHaveBeenCalledWith(SESSION_ID);
    expect(deps.getFocusedResources).not.toHaveBeenCalled();
    expect(chatState.setRetrying).not.toHaveBeenCalled();
    expect(services.sendChatMessage).not.toHaveBeenCalled();
    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'Model no longer available');
  });

  it('reports a thrown retry instead of rejecting', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);
    services.sendChatMessage.mockRejectedValue(new Error('IPC channel closed'));

    await createChatSender(deps).retry('hello', CLIENT_MESSAGE_ID);

    expect(chatState.setError).toHaveBeenCalledWith(SESSION_ID, 'IPC channel closed');
  });
});

describe('cancellation', () => {
  it('marks the viewed turn interrupted before tearing the backend session down', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);

    createChatSender(deps).cancel();

    expect(chatState.finalizeMessage).toHaveBeenCalledWith(SESSION_ID, { interrupted: true });
    expect(services.cancelChatSession).toHaveBeenCalledWith(PROJECT_ID, SESSION_ID);
  });

  it('drops the queued badge only when the backend could not cancel the message', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState);
    services.cancelQueuedChatMessage.mockResolvedValue({ success: false, error: 'already sent' });

    createChatSender(deps).cancelQueued(CLIENT_MESSAGE_ID);
    await vi.waitFor(() => {
      expect(chatState.markFollowUpDelivered).toHaveBeenCalledWith(SESSION_ID, CLIENT_MESSAGE_ID);
    });
  });

  it('keeps the queued bubble intact while the cancel succeeds', async () => {
    const chatState = makeChatState();
    const { deps } = makeDeps(chatState);

    createChatSender(deps).cancelQueued(CLIENT_MESSAGE_ID);
    await flushMicrotasks();

    expect(chatState.markFollowUpDelivered).not.toHaveBeenCalled();
  });
});

describe('without a project', () => {
  it('does nothing at all', async () => {
    const chatState = makeChatState();
    const { deps, services } = makeDeps(chatState, { projectId: null });
    const sender = createChatSender(deps);

    expect(await sender.send('hello')).toBeNull();
    await sender.retry('hello', CLIENT_MESSAGE_ID);
    sender.cancel();
    sender.cancelQueued(CLIENT_MESSAGE_ID);

    expect(services.sendChatMessage).not.toHaveBeenCalled();
    expect(services.cancelChatSession).not.toHaveBeenCalled();
    expect(services.cancelQueuedChatMessage).not.toHaveBeenCalled();
    expect(chatState.addUserMessage).not.toHaveBeenCalled();
  });
});
