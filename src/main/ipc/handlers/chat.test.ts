import { afterEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { Mock } from 'vitest';
import { chatEndpoints } from '../../../shared/ipc/chatEndpoints';
import type { ChatChoiceView } from '../../../shared/types';
import { success } from '../../services/result';
import { registerChatHandlers, type ChatHandlerDeps } from './chat';

const choice = {
  revision: 1,
  selected: { provider: 'claude', model: 'sonnet', effort: 'medium' },
  remembered: {
    claude: { model: 'sonnet', effort: 'medium' },
    codex: { model: 'gpt-5.6-sol', effort: 'medium' },
    pi: { model: 'cursor/auto', effort: 'medium' },
  },
  providers: [],
  controlsEnabled: false,
  responding: true,
  send: { allowed: true },
} satisfies ChatChoiceView;

function registeredHandler(channel: string) {
  const registration = (ipcMain.handle as unknown as Mock).mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel,
  );
  if (!registration) throw new Error(`No handler registered for ${channel}`);
  return registration[1] as (event: unknown, params: unknown) => Promise<unknown>;
}

function trustedEvent() {
  return {
    senderFrame: { url: 'http://localhost:5173/index.html' },
    sender: { getURL: () => 'http://localhost:5173/index.html' },
  };
}

describe('chat model-choice IPC handlers', () => {
  const previousRendererUrl = process.env.ELECTRON_RENDERER_URL;

  afterEach(() => {
    if (previousRendererUrl === undefined) delete process.env.ELECTRON_RENDERER_URL;
    else process.env.ELECTRON_RENDERER_URL = previousRendererUrl;
  });

  it('derives responding from the main-process session state', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';
    const open = vi.fn(async () => success(choice));
    const change = vi.fn(async () => success(choice));
    const getChatSessionState = vi.fn()
      .mockReturnValueOnce('processing')
      .mockReturnValueOnce('connecting');
    registerChatHandlers({
      modelChoice: { open, change },
      streamingSessionService: { getChatSessionState },
    } as unknown as ChatHandlerDeps);
    const projectId = '11111111-1111-4111-8111-111111111111';
    const chatSessionId = '22222222-2222-4222-8222-222222222222';

    await registeredHandler(chatEndpoints.openChoice.channel)(trustedEvent(), {
      projectId,
      chatSessionId,
      scope: 'main',
      responding: false,
    });
    await registeredHandler(chatEndpoints.changeChoice.channel)(trustedEvent(), {
      projectId,
      chatSessionId,
      expectedRevision: 1,
      intent: { type: 'choose_provider', provider: 'codex' },
      responding: false,
    });

    expect(open).toHaveBeenCalledWith({ projectId, chatSessionId, scope: 'main', responding: true });
    expect(change).toHaveBeenCalledWith({
      projectId,
      chatSessionId,
      expectedRevision: 1,
      intent: { type: 'choose_provider', provider: 'codex' },
      responding: true,
    });
  });
});
