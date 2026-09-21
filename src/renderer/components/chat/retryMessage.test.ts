import { describe, expect, it } from 'vitest';
import type { Message } from '../../stores/chat/types';
import { findRetryMessage } from './retryMessage';

function userMessage(message: string, clientMessageId?: string): Message {
  return {
    id: clientMessageId ?? 'server-assigned-id',
    role: 'user',
    segments: [{ type: 'text', content: message }],
    timestamp: new Date('2026-07-28T15:34:00.000Z'),
    clientMessageId,
  };
}

function assistantMessage(content: string): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    segments: [{ type: 'text', content }],
    timestamp: new Date('2026-07-28T15:34:05.000Z'),
  };
}

describe('findRetryMessage', () => {
  it('picks the most recent user message, skipping the assistant reply after it', () => {
    const messages = [
      userMessage('Analyze our tasks', 'client-1'),
      assistantMessage('Here you go.'),
      userMessage('Plan the Playwright walkthrough', 'client-2'),
      assistantMessage('Sure thing.'),
    ];

    expect(findRetryMessage(messages)).toBe(messages[2]);
  });

  it('skips a trailing user message with no clientMessageId (not retryable) to find the one before it', () => {
    const retryable = userMessage('Analyze our tasks', 'client-1');
    const messages: Message[] = [
      retryable,
      assistantMessage('Here you go.'),
      userMessage('unsent draft with no client id'),
    ];

    expect(findRetryMessage(messages)).toBe(retryable);
  });

  it('returns undefined when no user message has a clientMessageId', () => {
    const messages = [userMessage('unsent draft'), assistantMessage('reply')];

    expect(findRetryMessage(messages)).toBeUndefined();
  });

  it('returns undefined for an empty transcript', () => {
    expect(findRetryMessage([])).toBeUndefined();
  });
});
