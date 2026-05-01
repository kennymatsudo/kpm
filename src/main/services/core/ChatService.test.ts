import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatService, type ChatServiceDeps } from './ChatService';
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
    sendChatMessage: ReturnType<typeof vi.fn>;
    emitChatError: ReturnType<typeof vi.fn>;
  };
} {
  const project = makeProject();

  const addMessage = vi.fn(() => ({
    id: 'msg-1',
    session_id: project.id,
    chat_session_id: null,
    role: 'user' as const,
    content: '',
    created_at: '2026-01-01T00:00:00.000Z',
  }));

  const sendChatMessage = vi.fn(async () => success(undefined));
  const emitChatError = vi.fn();

  const deps: ChatServiceDeps = {
    projects: {
      get: vi.fn((id: string) => (id === project.id ? project : undefined)),
      // Other methods aren't called by sendMessage; cast to satisfy the interface.
    } as unknown as ChatServiceDeps['projects'],
    chatMessages: {
      addMessage,
    } as unknown as ChatServiceDeps['chatMessages'],
    loadPersistedPermissions: vi.fn(),
    clearSessionCache: vi.fn(),
    streamingSessionService: {
      sendChatMessage,
      interruptChatSession: vi.fn(),
      getActiveSessions: vi.fn(),
      getChatSessionState: vi.fn(),
    emitChatError,
    ...overrides,
  };

  return {
    deps,
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
});
