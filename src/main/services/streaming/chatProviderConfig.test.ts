import { describe, it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { CHAT_PROVIDER_CONFIG, markSessionReady } from './StreamingSessionService';

/**
 * CHAT_PROVIDER_CONFIG and markSessionReady replace the provider === 'claude'
 * / 'codex' branches that used to be scattered across StreamingSessionService
 * (session-title fetch, usage-model key, resume-session-id resolution, and
 * the two onReady closures) with one table keyed by provider.
 */

function makeManaged(): Parameters<typeof markSessionReady>[0] {
  return {
    key: 'chat:project-1:session-1',
    type: 'chat',
    projectId: 'project-1',
    session: {} as unknown as Parameters<typeof markSessionReady>[0]['session'],
    state: 'connecting',
    provider: 'claude',
    model: 'sonnet',
    lastActivity: Date.now(),
    mcpHealthStatus: 'healthy',
    mcpRecoveryAttempts: 0,
    segmentState: { currentSegmentId: 0, hasTextInCurrentSegment: false, pendingActivities: [] },
    toolUseActivities: new Map(),
    chatSessionId: 'session-1',
    persistHistory: true,
    forceApprovalReview: false,
    accumulatedResponse: '',
    lastTurnFinalized: false,
    suppressLifecycleEventsOnEnd: false,
    interruptInProgress: false,
    pendingFollowUpClientMessageIds: [],
    acceptedFollowUpClientMessageIds: [],
    promotedFollowUpClientMessageIds: new Set(),
    unsubscribePlanActions: () => {},
    unsubscribeClaudeMdUpdate: () => {},
    unsubscribeDocumentUpdate: () => {},
    unsubscribeFileDelete: () => {},
  };
}

function makeRepo() {
  return {
    get: vi.fn(),
    create: vi.fn(),
    updateClaudeSessionId: vi.fn(),
    updateProviderSessionId: vi.fn(),
    updateTitle: vi.fn(),
    clearClaudeSessionIdsByProject: vi.fn(),
  };
}

function fakeWindow(): { sent: { channel: string; payload: unknown }[]; window: BrowserWindow } {
  const sent: { channel: string; payload: unknown }[] = [];
  const window = {
    webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
  } as unknown as BrowserWindow;
  return { sent, window };
}

describe('CHAT_PROVIDER_CONFIG', () => {
  describe('usageModel', () => {
    it('claude reports the selected model', () => {
      expect(CHAT_PROVIDER_CONFIG.claude.usageModel({ model: 'opus' })).toBe('opus');
    });

    it('codex always reports the fixed "codex" label regardless of model', () => {
      expect(CHAT_PROVIDER_CONFIG.codex.usageModel({ model: 'opus' })).toBe('codex');
    });
  });

  describe('resolveResumeSessionId', () => {
    it('claude resumes from claude_session_id', () => {
      const chatSession = { claude_session_id: 'sdk-session-1', title: null };
      expect(CHAT_PROVIDER_CONFIG.claude.resolveResumeSessionId(chatSession)).toBe('sdk-session-1');
    });

    it('claude returns undefined when claude_session_id is null', () => {
      const chatSession = { claude_session_id: null, title: null };
      expect(CHAT_PROVIDER_CONFIG.claude.resolveResumeSessionId(chatSession)).toBeUndefined();
    });

    it('codex resumes from provider_session_id when the stored provider is codex', () => {
      const chatSession = { claude_session_id: null, provider: 'codex' as const, provider_session_id: 'codex-thread-1', title: null };
      expect(CHAT_PROVIDER_CONFIG.codex.resolveResumeSessionId(chatSession)).toBe('codex-thread-1');
    });

    it('codex does not resume from a claude-provider row even if provider_session_id is set', () => {
      const chatSession = { claude_session_id: null, provider: 'claude' as const, provider_session_id: 'stale', title: null };
      expect(CHAT_PROVIDER_CONFIG.codex.resolveResumeSessionId(chatSession)).toBeUndefined();
    });

    it('returns undefined when there is no existing chat session row', () => {
      expect(CHAT_PROVIDER_CONFIG.claude.resolveResumeSessionId(undefined)).toBeUndefined();
      expect(CHAT_PROVIDER_CONFIG.codex.resolveResumeSessionId(undefined)).toBeUndefined();
    });
  });

  describe('persistSessionId', () => {
    it('claude writes both the legacy and generalized columns', () => {
      const repo = makeRepo();
      CHAT_PROVIDER_CONFIG.claude.persistSessionId(repo, 'chat-session-1', 'sdk-session-1');
      expect(repo.updateClaudeSessionId).toHaveBeenCalledWith('chat-session-1', 'sdk-session-1');
      expect(repo.updateProviderSessionId).toHaveBeenCalledWith('chat-session-1', 'claude', 'sdk-session-1');
    });

    it('codex writes only the generalized column', () => {
      const repo = makeRepo();
      CHAT_PROVIDER_CONFIG.codex.persistSessionId(repo, 'chat-session-1', 'codex-thread-1');
      expect(repo.updateClaudeSessionId).not.toHaveBeenCalled();
      expect(repo.updateProviderSessionId).toHaveBeenCalledWith('chat-session-1', 'codex', 'codex-thread-1');
    });
  });

  describe('fetchSessionSummary', () => {
    it('is defined for claude', () => {
      expect(CHAT_PROVIDER_CONFIG.claude.fetchSessionSummary).toBeDefined();
    });

    it('is absent for codex', () => {
      expect(CHAT_PROVIDER_CONFIG.codex.fetchSessionSummary).toBeUndefined();
    });
  });
});

describe('markSessionReady', () => {
  it('marks the managed session processing and stores the sdk session id', () => {
    const managed = makeManaged();
    const repo = makeRepo();
    const { window } = fakeWindow();

    markSessionReady(managed, {
      sessionId: 'sdk-session-1',
      provider: 'claude',
      chatSessionId: 'session-1',
      persistHistory: true,
      mcpStatus: [],
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
    });

    expect(managed.state).toBe('processing');
    expect(managed.sessionId).toBe('sdk-session-1');
    expect(managed.lastTurnFinalized).toBe(false);
    expect(managed.processingStartTime).toBeDefined();
    expect(managed.lastSdkActivity).toBeDefined();
  });

  it('persists via the claude config when persistHistory is true', () => {
    const managed = makeManaged();
    const repo = makeRepo();
    const { window } = fakeWindow();

    markSessionReady(managed, {
      sessionId: 'sdk-session-1',
      provider: 'claude',
      chatSessionId: 'session-1',
      persistHistory: true,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
    });

    expect(repo.updateClaudeSessionId).toHaveBeenCalledWith('session-1', 'sdk-session-1');
    expect(repo.updateProviderSessionId).toHaveBeenCalledWith('session-1', 'claude', 'sdk-session-1');
  });

  it('persists via the codex config when persistHistory is true', () => {
    const managed = { ...makeManaged(), provider: 'codex' as const };
    const repo = makeRepo();
    const { window } = fakeWindow();

    markSessionReady(managed, {
      sessionId: 'codex-thread-1',
      provider: 'codex',
      chatSessionId: 'session-1',
      persistHistory: true,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
    });

    expect(repo.updateClaudeSessionId).not.toHaveBeenCalled();
    expect(repo.updateProviderSessionId).toHaveBeenCalledWith('session-1', 'codex', 'codex-thread-1');
  });

  it('skips persistence when persistHistory is false', () => {
    const managed = makeManaged();
    const repo = makeRepo();
    const { window } = fakeWindow();

    markSessionReady(managed, {
      sessionId: 'sdk-session-1',
      provider: 'claude',
      chatSessionId: 'session-1',
      persistHistory: false,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
    });

    expect(repo.updateClaudeSessionId).not.toHaveBeenCalled();
    expect(repo.updateProviderSessionId).not.toHaveBeenCalled();
  });

  it('sends chat:session-ready with the given mcpStatus', () => {
    const managed = makeManaged();
    const repo = makeRepo();
    const { sent, window } = fakeWindow();
    const mcpStatus = [{ name: 'claude.ai/foo', status: 'connected' as const, tools: [] }];

    markSessionReady(managed, {
      sessionId: 'sdk-session-1',
      provider: 'claude',
      chatSessionId: 'session-1',
      persistHistory: true,
      mcpStatus,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
    });

    const readyEvent = sent.find((e) => e.channel === 'chat:session-ready');
    expect((readyEvent!.payload as { mcpStatus: unknown }).mcpStatus).toBe(mcpStatus);
  });

  it('defaults mcpStatus to an empty array in the renderer event when omitted (codex)', () => {
    const managed = { ...makeManaged(), provider: 'codex' as const };
    const repo = makeRepo();
    const { sent, window } = fakeWindow();

    markSessionReady(managed, {
      sessionId: 'codex-thread-1',
      provider: 'codex',
      chatSessionId: 'session-1',
      persistHistory: true,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
    });

    const readyEvent = sent.find((e) => e.channel === 'chat:session-ready');
    expect((readyEvent!.payload as { mcpStatus: unknown[] }).mcpStatus).toEqual([]);
  });

  it('calls onMcpStatusReady when mcpStatus is provided (claude)', () => {
    const managed = makeManaged();
    const repo = makeRepo();
    const { window } = fakeWindow();
    const onMcpStatusReady = vi.fn();
    const mcpStatus = [{ name: 'claude.ai/foo', status: 'connected' as const, tools: [] }];

    markSessionReady(managed, {
      sessionId: 'sdk-session-1',
      provider: 'claude',
      chatSessionId: 'session-1',
      persistHistory: true,
      mcpStatus,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
      onMcpStatusReady,
    });

    expect(onMcpStatusReady).toHaveBeenCalledWith(mcpStatus);
  });

  it('does not call onMcpStatusReady when mcpStatus is omitted (codex), even if a handler is passed', () => {
    // Regression guard: onMcpStatusReady overwrites the saved managed-MCP-server
    // list, so calling it with [] for Codex would silently wipe that list.
    const managed = { ...makeManaged(), provider: 'codex' as const };
    const repo = makeRepo();
    const { window } = fakeWindow();
    const onMcpStatusReady = vi.fn();

    markSessionReady(managed, {
      sessionId: 'codex-thread-1',
      provider: 'codex',
      chatSessionId: 'session-1',
      persistHistory: true,
      projectId: 'project-1',
      mainWindow: window,
      chatSessionRepository: repo,
      onMcpStatusReady,
    });

    expect(onMcpStatusReady).not.toHaveBeenCalled();
  });
});
