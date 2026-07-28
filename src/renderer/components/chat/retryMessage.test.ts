import { describe, expect, it } from 'vitest';
import type { Message } from '../../stores/chat/types';
import { findRetryMessage } from './retryMessage';

function userMessage(message: string, clientMessageId: string): Message {
  return {
    id: clientMessageId,
    role: 'user',
    segments: [{ type: 'text', content: message }],
    timestamp: new Date('2026-07-28T15:34:00.000Z'),
    clientMessageId,
  };
}

describe('findRetryMessage', () => {
  it('resolves the retry message only from the selected chat transcript', () => {
    const firstChatMessages = [userMessage('Analyze our tasks', 'client-1')];
    const secondChatMessages = [userMessage('Plan the Playwright walkthrough', 'client-2')];

    expect(findRetryMessage(firstChatMessages)).toBe(firstChatMessages[0]);
    expect(findRetryMessage(secondChatMessages)).toBe(secondChatMessages[0]);
  });

  it('returns a stable value when the transcript has not changed', () => {
    const messages = [userMessage('Analyze our tasks', 'client-1')];

    expect(findRetryMessage(messages)).toBe(findRetryMessage(messages));
  });
});
