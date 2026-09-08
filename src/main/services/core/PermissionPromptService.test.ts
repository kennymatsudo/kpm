import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as AppEventsModule from '../../../shared/ipc/appEvents';
import type { BrowserWindow } from 'electron';
import type { PermissionRequest } from '../../../shared/types';
import { promptUser, resolvePromptResponse } from './PermissionPromptService';

const sent: PermissionRequest[] = [];

vi.mock('../../../shared/ipc/appEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof AppEventsModule>();
  return {
    ...actual,
    emitAppEvent: (_sender: unknown, _event: unknown, payload: PermissionRequest) => {
      sent.push(payload);
    },
  };
});

const mainWindow = { webContents: {} } as unknown as BrowserWindow;

function answerLatest(action: 'allow' | 'deny'): void {
  const latest = sent[sent.length - 1];
  resolvePromptResponse({
    requestId: latest.requestId,
    projectId: latest.projectId,
    action,
  });
}

beforeEach(() => {
  sent.length = 0;
});

describe('promptUser', () => {
  it('tags a project write request so the renderer can ask the right question', async () => {
    const pending = promptUser(mainWindow, 'project-1', 'Write', { file_path: '/repos/my-app/a.ts' }, {
      chatSessionId: 'chat-1',
      kind: 'write-access',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'write-access', chatSessionId: 'chat-1' });

    answerLatest('allow');
    await expect(pending).resolves.toMatchObject({ behavior: 'allow' });
  });

  it('routes an elicitation request to its conversation', async () => {
    const pending = promptUser(mainWindow, 'project-1', 'mcp_elicitation:acme', { message: 'Pick one' }, {
      chatSessionId: 'chat-2',
      kind: 'elicitation',
    });

    expect(sent[0]).toMatchObject({ kind: 'elicitation', chatSessionId: 'chat-2' });

    answerLatest('allow');
    await pending;
  });

  it('asks separately for a different conversation', async () => {
    const a = promptUser(mainWindow, 'project-1', 'Write', {}, {
      chatSessionId: 'chat-1',
      kind: 'write-access',
    });
    const b = promptUser(mainWindow, 'project-1', 'Write', {}, {
      chatSessionId: 'chat-2',
      kind: 'write-access',
    });

    expect(sent).toHaveLength(2);
    expect(sent.map((request) => request.chatSessionId)).toEqual(['chat-1', 'chat-2']);

    resolvePromptResponse({ requestId: sent[0].requestId, projectId: 'project-1', action: 'deny' });
    resolvePromptResponse({ requestId: sent[1].requestId, projectId: 'project-1', action: 'deny' });
    await Promise.all([a, b]);
  });

  it('echoes the original tool input back rather than blanking it', async () => {
    const input = { file_path: '/repos/my-app/a.ts', content: 'hello' };
    const pending = promptUser(mainWindow, 'project-1', 'Write', input, {});

    answerLatest('allow');

    const result = await pending;
    expect(result.behavior).toBe('allow');
    if (result.behavior === 'allow') expect(result.updatedInput).toEqual(input);
  });

  it('refuses an answer that names a different project', async () => {
    const pending = promptUser(mainWindow, 'project-1', 'Write', {}, {
      chatSessionId: 'chat-1',
      kind: 'write-access',
    });

    const response = resolvePromptResponse({
      requestId: sent[0].requestId,
      projectId: 'project-2',
      action: 'allow',
    });

    expect(response).toEqual({
      ok: false,
      error: 'Permission request project does not match',
    });

    answerLatest('deny');
    await pending;
  });

  it('denies when there is no window to ask in', async () => {
    await expect(promptUser(null, 'project-1', 'Write', {}, {})).resolves.toMatchObject({ behavior: 'deny' });
  });
});
