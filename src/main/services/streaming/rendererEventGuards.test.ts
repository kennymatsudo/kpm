import { describe, it, expect } from 'vitest';
import type { BrowserWindow } from 'electron';
import { sendChatActivityIfActive, sendChatThinkingIfActive, sendChatChunkIfActive } from './StreamingSessionService';

/**
 * These three functions gate renderer output on managed.interruptInProgress
 * — the flag that suppresses a stale turn's output while an interrupt-and-
 * send orchestration tears it down. There was previously no test exercising
 * this suppression at all.
 */

function fakeWindow(): { sent: { channel: string; payload: unknown }[]; window: BrowserWindow } {
  const sent: { channel: string; payload: unknown }[] = [];
  const window = {
    webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
  } as unknown as BrowserWindow;
  return { sent, window };
}

describe('sendChatActivityIfActive', () => {
  it('sends the activity when no interrupt is in progress', () => {
    const { sent, window } = fakeWindow();
    const activity = { id: 'a1', type: 'other' as const, label: 'Retrying' };

    sendChatActivityIfActive({ interruptInProgress: false }, window, 'project-1', 'session-1', activity);

    expect(sent).toEqual([
      { channel: 'chat:activity', payload: { projectId: 'project-1', chatSessionId: 'session-1', activity } },
    ]);
  });

  it('does not send while an interrupt is in progress', () => {
    const { sent, window } = fakeWindow();
    const activity = { id: 'a1', type: 'other' as const, label: 'Retrying' };

    sendChatActivityIfActive({ interruptInProgress: true }, window, 'project-1', 'session-1', activity);

    expect(sent).toEqual([]);
  });
});

describe('sendChatThinkingIfActive', () => {
  it('sends chat:thinking when no interrupt is in progress', () => {
    const { sent, window } = fakeWindow();

    sendChatThinkingIfActive({ interruptInProgress: false }, window, 'project-1', 'session-1', 'hmm');

    expect(sent).toEqual([
      { channel: 'chat:thinking', payload: { projectId: 'project-1', chatSessionId: 'session-1', text: 'hmm' } },
    ]);
  });

  it('does not send while an interrupt is in progress', () => {
    const { sent, window } = fakeWindow();

    sendChatThinkingIfActive({ interruptInProgress: true }, window, 'project-1', 'session-1', 'hmm');

    expect(sent).toEqual([]);
  });

  it('is a no-op when mainWindow is null, interrupted or not', () => {
    expect(() => sendChatThinkingIfActive({ interruptInProgress: false }, null, 'project-1', 'session-1', 'hmm')).not.toThrow();
    expect(() => sendChatThinkingIfActive({ interruptInProgress: true }, null, 'project-1', 'session-1', 'hmm')).not.toThrow();
  });
});

describe('sendChatChunkIfActive', () => {
  it('sends chat:chunk when no interrupt is in progress', () => {
    const { sent, window } = fakeWindow();

    sendChatChunkIfActive({ interruptInProgress: false }, window, 'project-1', 'session-1', 'hmm', 2, undefined);

    expect(sent).toEqual([
      {
        channel: 'chat:chunk',
        payload: { projectId: 'project-1', chatSessionId: 'session-1', text: 'hmm', segmentId: 2, precedingActivities: undefined },
      },
    ]);
  });

  it('forwards precedingActivities when provided', () => {
    const { sent, window } = fakeWindow();
    const activity = { id: 'a1', type: 'other' as const, label: 'Retrying' };

    sendChatChunkIfActive({ interruptInProgress: false }, window, 'project-1', 'session-1', 'hmm', 0, [activity]);

    expect((sent[0].payload as { precedingActivities: unknown }).precedingActivities).toEqual([activity]);
  });

  it('does not send while an interrupt is in progress', () => {
    const { sent, window } = fakeWindow();

    sendChatChunkIfActive({ interruptInProgress: true }, window, 'project-1', 'session-1', 'hmm', 0, undefined);

    expect(sent).toEqual([]);
  });

  it('is a no-op when mainWindow is null, interrupted or not', () => {
    expect(() => sendChatChunkIfActive({ interruptInProgress: false }, null, 'project-1', 'session-1', 'hmm', 0, undefined)).not.toThrow();
    expect(() => sendChatChunkIfActive({ interruptInProgress: true }, null, 'project-1', 'session-1', 'hmm', 0, undefined)).not.toThrow();
  });
});
