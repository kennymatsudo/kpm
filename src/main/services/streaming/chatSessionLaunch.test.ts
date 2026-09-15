import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatSessionLaunch,
  type ChatLaunchRequest,
  type ChatSessionFactories,
  type ChatSessionHost,
} from './chatSessionLaunch';
import type { IChatSession } from './IChatSession';
import type { PlanContext } from '../../chat/prompts';
import type { ChatChoiceEffort, ChatProvider } from '../../../shared/types';

vi.mock('../../codex/KpmCodexMcpServer', () => ({
  registerCodexMcpSession: vi.fn(async () => ({ serverName: 'kpm' })),
}));

vi.mock('../../pi/kpmToolAdapter', () => ({
  buildPiKpmTools: vi.fn((options: { focus: boolean }) => ({
    tools: [],
    toolNames: options.focus ? ['focus-tool'] : ['main-tool'],
  })),
}));

const { registerCodexMcpSession } = await import('../../codex/KpmCodexMcpServer');
const { buildPiKpmTools } = await import('../../pi/kpmToolAdapter');

type ClaudeConfig = Parameters<ChatSessionFactories['claude']>[0];
type CodexConfig = Parameters<ChatSessionFactories['codex']>[0];
type PiConfig = Parameters<ChatSessionFactories['pi']>[0];

const stubSession = { isReady: () => true } as unknown as IChatSession;

interface Captured {
  claude?: ClaudeConfig;
  codex?: CodexConfig;
  pi?: PiConfig;
}

function recordingFactories(captured: Captured): ChatSessionFactories {
  return {
    claude: (config) => { captured.claude = config; return stubSession; },
    codex: (config) => { captured.codex = config; return stubSession; },
    pi: (config) => { captured.pi = config; return stubSession; },
  };
}

function makeHost(overrides: Partial<ChatSessionHost> = {}): ChatSessionHost {
  return {
    onMessage: vi.fn(),
    onSessionEnd: vi.fn(),
    onReady: vi.fn(),
    onMcpError: vi.fn(),
    onSlashCommands: vi.fn(),
    requestWriteConsent: vi.fn(async () => ({ allowed: true as const })),
    hasWriteAccess: vi.fn(() => false),
    requestApproval: vi.fn(async () => true),
    onElicitation: vi.fn(async () => ({ action: 'decline' as const })),
    onContextFileEdit: vi.fn(),
    onProjectFileWrite: vi.fn(),
    peekPendingFile: vi.fn(() => undefined),
    ...overrides,
  };
}

const buildClaudeSdkOptions = vi.fn((_context: PlanContext, options: unknown) => ({
  claudeOptions: options,
})) as unknown as ChatLaunchRequest['buildClaudeSdkOptions'];

function makeRequest(overrides: Partial<ChatLaunchRequest> = {}): ChatLaunchRequest {
  return {
    key: 'chat:project-1:session-1',
    projectId: 'project-1',
    chatSessionId: 'session-1',
    provider: 'claude',
    model: 'sonnet',
    context: {} as PlanContext,
    persistHistory: true,
    forceApprovalReview: false,
    mainWindow: null,
    unsubscribeToolProposals: () => {},
    buildClaudeSdkOptions,
    host: makeHost(),
    ...overrides,
  };
}

function launchWith(overrides: Partial<ChatLaunchRequest>) {
  const captured: Captured = {};
  const launch = buildChatSessionLaunch(makeRequest(overrides), recordingFactories(captured));
  return { ...launch, captured };
}

describe('buildChatSessionLaunch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives Claude its SDK options, with no window and no SDK client', () => {
    const host = makeHost();
    const { captured } = launchWith({
      provider: 'claude',
      model: 'opus',
      effort: 'high',
      resumeSessionId: 'sdk-session-9',
      host,
    });

    expect(captured.codex).toBeUndefined();
    expect(captured.pi).toBeUndefined();
    expect(buildClaudeSdkOptions).toHaveBeenCalledWith({}, expect.objectContaining({
      model: 'opus',
      effort: 'high',
      resumeSessionId: 'sdk-session-9',
      mainWindow: null,
      chatSessionId: 'session-1',
      onContextFileEdit: host.onContextFileEdit,
      onProjectFileWrite: host.onProjectFileWrite,
      peekPendingFile: host.peekPendingFile,
    }));
    expect(captured.claude?.onMessage).toBe(host.onMessage);
    expect(captured.claude?.onMcpError).toBe(host.onMcpError);
    expect(captured.claude?.onSlashCommands).toBe(host.onSlashCommands);
  });

  it('selects a Codex model and thread through the provider-native fields', () => {
    const host = makeHost();
    const { captured } = launchWith({
      provider: 'codex',
      model: 'sonnet',
      providerModel: 'gpt-5.4-codex',
      effort: 'xhigh',
      resumeSessionId: 'thread-4',
      host,
    });

    expect(buildClaudeSdkOptions).not.toHaveBeenCalled();
    expect(captured.codex).toMatchObject({
      model: 'gpt-5.4-codex',
      modelReasoningEffort: 'xhigh',
      resumeThreadId: 'thread-4',
    });
    expect(captured.codex?.requestExternalApproval).toBe(host.requestApproval);
    expect(captured.codex?.hasWriteAccess).toBe(host.hasWriteAccess);
    expect(captured.codex?.requestWriteConsent).toBe(host.requestWriteConsent);
  });

  it('gives pi its tool set and passes the effort through as a thinking level', () => {
    const { captured } = launchWith({
      provider: 'pi',
      providerModel: 'anthropic/claude-opus-5',
      effort: 'off',
      resumeSessionId: 'pi-session-2',
    });

    expect(captured.pi).toMatchObject({
      model: 'anthropic/claude-opus-5',
      thinkingLevel: 'off',
      resumeSessionId: 'pi-session-2',
    });
    expect(buildPiKpmTools).toHaveBeenCalledWith({
      focus: false,
      projectId: 'project-1',
      chatSessionId: 'session-1',
    });
    expect(captured.pi?.kpmTools?.toolNames).toEqual(['main-tool']);
  });

  it('scopes the tool set to the focused document when the context carries one', async () => {
    const focusContext = { focusDocument: { path: 'docs/spec.md' } } as unknown as PlanContext;

    launchWith({ provider: 'pi', context: focusContext });
    expect(buildPiKpmTools).toHaveBeenCalledWith(expect.objectContaining({ focus: true }));

    const { captured } = launchWith({ provider: 'codex', context: focusContext });
    await captured.codex?.registerMcpSession?.();
    expect(registerCodexMcpSession).toHaveBeenCalledWith({
      projectId: 'project-1',
      chatSessionId: 'session-1',
      focus: true,
    });
  });

  describe('effort narrowing', () => {
    const cases: { effort: ChatChoiceEffort; claude?: string; codex?: string }[] = [
      { effort: 'off', claude: undefined, codex: undefined },
      { effort: 'minimal', claude: undefined, codex: 'minimal' },
      { effort: 'low', claude: 'low', codex: 'low' },
      { effort: 'medium', claude: 'medium', codex: 'medium' },
      { effort: 'high', claude: 'high', codex: 'high' },
      { effort: 'xhigh', claude: 'xhigh', codex: 'xhigh' },
      { effort: 'max', claude: 'max', codex: 'max' },
    ];

    it.each(cases)('narrows $effort per provider', ({ effort, claude, codex }) => {
      launchWith({ provider: 'claude', effort });
      expect(buildClaudeSdkOptions).toHaveBeenLastCalledWith({}, expect.objectContaining({ effort: claude }));

      const codexLaunch = launchWith({ provider: 'codex', effort });
      expect(codexLaunch.captured.codex?.modelReasoningEffort).toBe(codex);

      const piLaunch = launchWith({ provider: 'pi', effort });
      expect(piLaunch.captured.pi?.thinkingLevel).toBe(effort);
    });
  });

  describe('elicitation reaches the host from either provider', () => {
    it('forwards Claude elicitations with the turn abort signal', async () => {
      const host = makeHost();
      const { captured } = launchWith({ provider: 'claude', host });
      const onElicitation = (captured.claude?.sdkOptions as unknown as {
        claudeOptions: { onElicitation: (request: unknown, options: unknown) => Promise<unknown> };
      }).claudeOptions.onElicitation;

      const signal = new AbortController().signal;
      await onElicitation({ mode: 'form', serverName: 'linear' }, { signal, requestId: 'req-1' });

      expect(host.onElicitation).toHaveBeenCalledWith({ mode: 'form', serverName: 'linear' }, { signal });
    });

    it('forwards Codex elicitations', async () => {
      const host = makeHost();
      const { captured } = launchWith({ provider: 'codex', host });

      await captured.codex?.onMcpElicitation?.({ mode: 'form', serverName: 'playwright' });

      expect(host.onElicitation).toHaveBeenCalledWith({ mode: 'form', serverName: 'playwright' });
    });
  });

  describe('the registry record', () => {
    it.each<ChatProvider>(['claude', 'codex', 'pi'])('describes a connecting %s session', (provider) => {
      const unsubscribeToolProposals = vi.fn();
      const { session, managed } = launchWith({
        provider,
        model: 'opus',
        providerModel: provider === 'claude' ? undefined : 'provider-model',
        effort: 'medium',
        titleSeed: 'first message',
        persistHistory: false,
        forceApprovalReview: true,
        unsubscribeToolProposals,
      });

      expect(managed).toMatchObject({
        key: 'chat:project-1:session-1',
        projectId: 'project-1',
        chatSessionId: 'session-1',
        session,
        state: 'connecting',
        provider,
        model: 'opus',
        effort: 'medium',
        titleSeed: 'first message',
        persistHistory: false,
        forceApprovalReview: true,
        mcpHealthStatus: 'healthy',
        mcpRecoveryAttempts: 0,
        accumulatedResponse: '',
        hasStreamedResponseText: false,
        suppressLifecycleEventsOnEnd: false,
      });
      expect(managed.unsubscribeToolProposals).toBe(unsubscribeToolProposals);
      expect(managed.toolUseActivities.size).toBe(0);
      expect(managed.followUps.queuedCount).toBe(0);
    });
  });
});
