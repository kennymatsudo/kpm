import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversationWriteGrants, type ConversationWriteGrants } from './writeGrants';

let writeGrants: ConversationWriteGrants;

beforeEach(() => {
  writeGrants = createConversationWriteGrants();
});

describe('conversationWriteGrants', () => {
  it('asks once, then allows later writes from the conversation grant', async () => {
    const requestConsent = vi.fn().mockResolvedValue(true);

    const first = await writeGrants.request('chat-1', requestConsent);
    const second = await writeGrants.request('chat-1', requestConsent);

    expect(first).toEqual({ allowed: true });
    expect(second).toEqual({ allowed: true });
    expect(requestConsent).toHaveBeenCalledTimes(1);
  });

  it('refuses and records nothing when the user declines', async () => {
    const decision = await writeGrants.request('chat-1', async () => false);

    expect(decision.allowed).toBe(false);
    expect(writeGrants.has('chat-1')).toBe(false);
  });

  it('tells the model not to retry after a refusal', async () => {
    const decision = await writeGrants.request('chat-1', async () => false);

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('Do not retry');
  });

  it('refuses without asking when there is no chat session', async () => {
    const requestConsent = vi.fn().mockResolvedValue(true);

    const decision = await writeGrants.request(undefined, requestConsent);

    expect(decision.allowed).toBe(false);
    expect(requestConsent).not.toHaveBeenCalled();
  });

  it('keeps grants separate per chat session', async () => {
    await writeGrants.request('chat-1', async () => true);

    expect(writeGrants.has('chat-1')).toBe(true);
    expect(writeGrants.has('chat-2')).toBe(false);
  });

  it('coalesces concurrent requests for one conversation', async () => {
    let approve!: (allowed: boolean) => void;
    const requestConsent = vi.fn(() => new Promise<boolean>((resolve) => {
      approve = resolve;
    }));

    const first = writeGrants.request('chat-1', requestConsent);
    const second = writeGrants.request('chat-1', requestConsent);
    approve(true);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { allowed: true },
      { allowed: true },
    ]);
    expect(requestConsent).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent requests independent across conversations', async () => {
    const first = writeGrants.request('chat-1', async () => true);
    const second = writeGrants.request('chat-2', async () => false);

    await expect(first).resolves.toEqual({ allowed: true });
    await expect(second).resolves.toMatchObject({ allowed: false });
    expect(writeGrants.has('chat-1')).toBe(true);
    expect(writeGrants.has('chat-2')).toBe(false);
  });

  it('revokes one conversation without touching another', async () => {
    await writeGrants.request('chat-1', async () => true);
    await writeGrants.request('chat-2', async () => true);

    writeGrants.revoke('chat-1');

    expect(writeGrants.has('chat-1')).toBe(false);
    expect(writeGrants.has('chat-2')).toBe(true);
  });

  it('reports every state change', () => {
    const listener = vi.fn();
    writeGrants.subscribe(listener);

    return writeGrants.request('chat-1', async () => true).then(() => {
      writeGrants.revoke('chat-1');

      expect(listener.mock.calls).toEqual([
        ['chat-1', true],
        ['chat-1', false],
      ]);
    });
  });

  it('stops publishing after unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = writeGrants.subscribe(listener);

    await writeGrants.request('chat-1', async () => true);
    unsubscribe();
    writeGrants.revoke('chat-1');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
