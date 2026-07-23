import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatService, type ChatServiceDeps } from './ChatService';
import { failure, success } from '../result';
import type { ChatAttachment, Project } from '../../../shared/types';

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    phase: 'planning',
    folder_path: '/tmp/test-project',
    storybook_url: null,
    sort_order: 0,
    icon: null,
    created_at: '2026-01-01T00:00:00.000Z',
    session_tokens: 0,
    session_input_tokens: 0,
    session_output_tokens: 0,
  } as unknown as Project;
}

function makeDeps(overrides: Partial<ChatServiceDeps> = {}): {
  deps: ChatServiceDeps;
  spies: {
    addMessage: ReturnType<typeof vi.fn>;
    createFocusDocument: ReturnType<typeof vi.fn>;
    updateFocusDocument: ReturnType<typeof vi.fn>;
    sendChatMessage: ReturnType<typeof vi.fn>;
    disconnectChatSession: ReturnType<typeof vi.fn>;
    emitChatError: ReturnType<typeof vi.fn>;
  };
} {
  const project = makeProject();

  const addMessage = vi.fn(() => ({
    id: 'msg-1',
    session_id: project.id,
    chat_session_id: null,
    provider: 'claude' as const,
    role: 'user' as const,
    content: '',
    created_at: '2026-01-01T00:00:00.000Z',
  }));

  const sendChatMessage = vi.fn(async () => success(undefined));
  const disconnectChatSession = vi.fn(async () => success(undefined));
  const emitChatError = vi.fn();
  const createFocusDocument = vi.fn((id: string, projectId: string, documentPath: string, title: string, contentHash: string) => ({
    id,
    project_id: projectId,
    claude_session_id: null,
    provider: 'claude' as const,
    provider_session_id: null,
    scope: 'focus_document' as const,
    focus_document_path: documentPath,
    focus_document_title: title,
    focus_document_hash: contentHash,
    last_opened_at: '2026-01-01T00:00:00.000Z',
    title: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  const updateFocusDocument = vi.fn((id: string, title: string, contentHash: string) => ({
    id,
    project_id: project.id,
    claude_session_id: null,
    provider: 'claude' as const,
    provider_session_id: null,
    scope: 'focus_document' as const,
    focus_document_path: 'docs/a.md',
    focus_document_title: title,
    focus_document_hash: contentHash,
    last_opened_at: '2026-01-01T00:00:00.000Z',
    title: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }));

  const deps: ChatServiceDeps = {
    projects: {
      get: vi.fn((id: string) => (id === project.id ? project : undefined)),
      // Other methods aren't called by sendMessage; cast to satisfy the interface.
    } as unknown as ChatServiceDeps['projects'],
    chatMessages: {
      addMessage,
      getMessagesByChatSession: vi.fn(() => []),
    } as unknown as ChatServiceDeps['chatMessages'],
    chatSessions: {
      create: vi.fn(),
      createFocusDocument,
      get: vi.fn(),
      getFocusDocument: vi.fn(),
      updateFocusDocument,
      updateClaudeSessionId: vi.fn(),
      updateProviderSessionId: vi.fn(),
      updateModelChoice: vi.fn(),
      updateTitle: vi.fn(),
      clearClaudeSessionIdsByProject: vi.fn(),
      clearProviderSessionIdsByProject: vi.fn(),
      delete: vi.fn(),
    },
    clearSessionCache: vi.fn(),
    streamingSessionService: {
      sendChatMessage,
      disconnectChatSession,
    },
    emitChatError,
    ...overrides,
  };

  return {
    deps,
    spies: { addMessage, createFocusDocument, updateFocusDocument, sendChatMessage, disconnectChatSession, emitChatError },
  };
}

describe('ChatService.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards tempImages converted to ChatAttachment[] to the streaming service', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: 'describe this',
      chatSessionId: 'session-1',
      tempImages: [
        '/tmp/kpm-images/kpm-paste-1.png',
        '/tmp/kpm-images/kpm-paste-2.jpeg',
      ],
    });

    expect(result.ok).toBe(true);
    expect(spies.sendChatMessage).toHaveBeenCalledTimes(1);
    const [, , options] = spies.sendChatMessage.mock.calls[0];
    expect(options.attachments).toEqual<ChatAttachment[]>([
      {
        kind: 'image',
        path: '/tmp/kpm-images/kpm-paste-1.png',
        filename: 'kpm-paste-1.png',
        mediaType: 'image/png',
      },
      {
        kind: 'image',
        path: '/tmp/kpm-images/kpm-paste-2.jpeg',
        filename: 'kpm-paste-2.jpeg',
        mediaType: 'image/jpeg',
      },
    ]);
  });

  it('persists the user message as plain text without an attachment prefix', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    await service.sendMessage({
      projectId: 'project-1',
      message: 'describe this',
      chatSessionId: 'session-1',
      tempImages: ['/tmp/kpm-images/kpm-paste-1.png'],
    });

    expect(spies.addMessage).toHaveBeenCalledTimes(1);
    const [, role, content] = spies.addMessage.mock.calls[0];
    expect(role).toBe('user');
    expect(content).toBe('describe this');
    expect(content).not.toMatch(/Images attached/i);
  });

  it('does not persist a user message when the streaming service rejects it', async () => {
    const { deps, spies } = makeDeps({
      streamingSessionService: {
        sendChatMessage: vi.fn(async () => failure('A follow-up is already queued.')),
        disconnectChatSession: vi.fn(),
      },
    });
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: 'queued too soon',
      chatSessionId: 'session-1',
      clientMessageId: 'client-1',
    });

    expect(result.ok).toBe(false);
    expect(spies.addMessage).not.toHaveBeenCalled();
    expect(spies.emitChatError).toHaveBeenCalledWith({
      projectId: 'project-1',
      chatSessionId: 'session-1',
      error: 'A follow-up is already queued.',
    });
  });

  it('rejects an unsupported attachment extension with a clear error', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: 'describe',
      chatSessionId: 'session-1',
      tempImages: ['/tmp/kpm-images/kpm-paste-1.bmp'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/bmp|unsupported/i);
    }
    expect(spies.sendChatMessage).not.toHaveBeenCalled();
    expect(spies.addMessage).not.toHaveBeenCalled();
  });

  it('omits attachments option when no temp images are present', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    await service.sendMessage({
      projectId: 'project-1',
      message: 'plain message',
      chatSessionId: 'session-1',
    });

    expect(spies.sendChatMessage).toHaveBeenCalledTimes(1);
    const [, , options] = spies.sendChatMessage.mock.calls[0];
    expect(options.attachments).toBeUndefined();
  });

  it('uses one authoritative choice snapshot for dispatch and user-message attribution', async () => {
    const resolvedChoice = {
      provider: 'codex' as const,
      model: 'gpt-5.6-terra',
      effort: 'xhigh' as const,
      revision: 7,
    };
    const resolveForTurn = vi.fn(async () => success(resolvedChoice));
    const { deps, spies } = makeDeps({
      modelChoice: {
        resolveForTurn,
      } as unknown as ChatServiceDeps['modelChoice'],
    });
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: 'use the selected model',
      chatSessionId: 'session-1',
    });

    expect(result.ok).toBe(true);
    expect(resolveForTurn).toHaveBeenCalledTimes(1);
    expect(spies.sendChatMessage).toHaveBeenCalledWith(
      'project-1',
      'use the selected model',
      expect.objectContaining({ authoritativeChoice: resolvedChoice }),
    );
    expect(spies.addMessage.mock.calls[0][5]).toBe('codex');
  });

  it('forwards and persists an explicit chat provider', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: 'use codex',
      chatSessionId: 'session-1',
      provider: 'codex',
    });

    expect(result.ok).toBe(true);
    const [, , options] = spies.sendChatMessage.mock.calls[0];
    expect(options.provider).toBe('codex');
    expect(spies.addMessage).toHaveBeenCalledWith(
      'project-1',
      'user',
      'use codex',
      'session-1',
      undefined,
      'codex',
    );
  });

  it('expands pi prompt templates before sending while preserving the user-entered text in history', async () => {
    const { deps, spies } = makeDeps({
      slashCommandService: {
        expandPiPromptInvocation: vi.fn(() => success('Expanded prompt')),
      },
    });
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: '/review src/main',
      chatSessionId: 'session-1',
    });

    expect(result.ok).toBe(true);
    expect(spies.sendChatMessage).toHaveBeenCalledWith(
      'project-1',
      'Expanded prompt',
      expect.objectContaining({ chatSessionId: 'session-1' }),
    );
    expect(spies.addMessage).toHaveBeenCalledWith(
      'project-1',
      'user',
      '/review src/main',
      'session-1',
      undefined,
      'claude',
    );
  });

  it('uses the configured default chat provider when none is supplied', async () => {
    const { deps, spies } = makeDeps({
      getDefaultChatProvider: () => 'codex',
    });
    const service = createChatService(deps);

    const result = await service.sendMessage({
      projectId: 'project-1',
      message: 'default provider',
      chatSessionId: 'session-1',
    });

    expect(result.ok).toBe(true);
    const [, , options] = spies.sendChatMessage.mock.calls[0];
    expect(options.provider).toBe('codex');
    expect(spies.addMessage.mock.calls[0][5]).toBe('codex');
  });

  it('persists focus document chat turns', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    const result = await service.sendMessage(
      {
        projectId: 'project-1',
        message: 'summarize this section',
        chatSessionId: 'session-1',
      },
      {
        focusedResources: [],
        currentView: 'focus',
        focusDocument: {
          path: 'docs/a.md',
          title: 'A',
          content: '# A',
        },
      },
    );

    expect(result.ok).toBe(true);
    const [, , options] = spies.sendChatMessage.mock.calls[0];
    expect(options.persistHistory).toBe(true);
    expect(options.focusDocument).toEqual({ path: 'docs/a.md', title: 'A', content: '# A' });
    expect(spies.addMessage).toHaveBeenCalledTimes(1);
  });
});

describe('ChatService.getOrCreateFocusDocumentSession', () => {
  it('creates a scoped focus document session when none exists', async () => {
    const { deps, spies } = makeDeps();
    const service = createChatService(deps);

    const result = await service.getOrCreateFocusDocumentSession({
      projectId: 'project-1',
      path: 'docs/a.md',
      title: 'A',
      contentHash: 'hash-a',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.chatSessionId).toBeTruthy();
      expect(result.data.messages).toEqual([]);
    }
    expect(spies.createFocusDocument).toHaveBeenCalledWith(
      expect.any(String),
      'project-1',
      'docs/a.md',
      'A',
      'hash-a',
    );
    expect(spies.disconnectChatSession).not.toHaveBeenCalled();
  });

  it('disconnects the live SDK session when document content changed', async () => {
    const existing = {
      id: 'session-1',
      project_id: 'project-1',
      claude_session_id: 'claude-1',
      provider: 'claude' as const,
      provider_session_id: 'claude-1',
      scope: 'focus_document' as const,
      focus_document_path: 'docs/a.md',
      focus_document_title: 'A',
      focus_document_hash: 'old-hash',
      last_opened_at: '2026-01-01T00:00:00.000Z',
      title: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const { deps, spies } = makeDeps({
      chatSessions: {
        create: vi.fn(),
        createFocusDocument: vi.fn(),
        get: vi.fn(),
        getFocusDocument: vi.fn(() => existing),
        updateFocusDocument: vi.fn((id: string, title: string, contentHash: string, clearClaudeSessionId: boolean) => ({
          ...existing,
          id,
          focus_document_title: title,
          focus_document_hash: contentHash,
          claude_session_id: clearClaudeSessionId ? null : existing.claude_session_id,
          provider_session_id: clearClaudeSessionId ? null : existing.provider_session_id,
        })),
        updateClaudeSessionId: vi.fn(),
        updateProviderSessionId: vi.fn(),
        updateModelChoice: vi.fn(),
        updateTitle: vi.fn(),
        clearClaudeSessionIdsByProject: vi.fn(),
        clearProviderSessionIdsByProject: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = createChatService(deps);

    const result = await service.getOrCreateFocusDocumentSession({
      projectId: 'project-1',
      path: 'docs/a.md',
      title: 'A',
      contentHash: 'new-hash',
    });

    expect(result.ok).toBe(true);
    expect(spies.disconnectChatSession).toHaveBeenCalledWith('project-1', 'session-1');
    expect(deps.chatSessions.updateFocusDocument).toHaveBeenCalledWith(
      'session-1',
      'A',
      'new-hash',
      true,
    );
  });
});
