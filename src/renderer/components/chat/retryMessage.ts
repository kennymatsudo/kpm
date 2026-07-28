import type { Message } from '../../stores/chat/types';

export function findRetryMessage(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== 'user' || !candidate.clientMessageId) continue;
    return candidate;
  }
  return undefined;
}
