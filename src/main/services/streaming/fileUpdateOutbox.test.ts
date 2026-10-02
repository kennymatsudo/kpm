import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileUpdateEventData } from '../../../shared/ipc/chatEvents';
import { createFileUpdateOutbox } from './fileUpdateOutbox';

const QUIET_MS = 1000;

const update = (filePath: string, content: string, oldContent: string | null): FileUpdateEventData => ({
  projectId: 'project-1',
  chatSessionId: 'chat-1',
  filePath,
  content,
  oldContent,
});

function createOutbox() {
  const sent: FileUpdateEventData[] = [];
  const outbox = createFileUpdateOutbox((sentUpdate) => sent.push(sentUpdate), QUIET_MS);
  return { outbox, sent };
}

describe('createFileUpdateOutbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one update per file, diffing the pre-turn content against the last edit', async () => {
    const { outbox, sent } = createOutbox();
    outbox.stage('session', update('notes.md', 'v1', 'original'));
    outbox.stage('session', update('plan.md', 'p1', null));
    outbox.stage('session', update('notes.md', 'v2', 'v1'));
    outbox.stage('session', update('notes.md', 'v3', 'v2'));
    await outbox.flush('session');

    expect(sent).toEqual([
      update('notes.md', 'v3', 'original'),
      update('plan.md', 'p1', null),
    ]);
  });

  it('sends held edits once they go quiet, without waiting for the turn to end', async () => {
    const { outbox, sent } = createOutbox();
    outbox.stage('session', update('notes.md', 'v1', 'original'));
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    outbox.stage('session', update('notes.md', 'v2', 'v1'));
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([update('notes.md', 'v2', 'original')]);

    await outbox.flush('session');
    expect(sent).toHaveLength(1);
  });

  it('keeps call order when an earlier edit resolves after a later one', async () => {
    const { outbox, sent } = createOutbox();
    let resolveFirst!: (value: FileUpdateEventData) => void;
    outbox.stage('session', new Promise((resolve) => { resolveFirst = resolve; }));
    outbox.stage('session', update('notes.md', 'v2', 'original'));
    const flushed = outbox.flush('session');
    resolveFirst(update('notes.md', 'v1', 'original'));
    await flushed;

    expect(sent).toEqual([update('notes.md', 'v2', 'original')]);
  });

  it('sends a slow earlier batch before a newer one for the same session', async () => {
    const { outbox, sent } = createOutbox();
    let resolveFirst!: (value: FileUpdateEventData) => void;
    outbox.stage('session', new Promise((resolve) => { resolveFirst = resolve; }));
    void outbox.flush('session');
    outbox.stage('session', update('notes.md', 'v2', 'v1'));
    const second = outbox.flush('session');
    resolveFirst(update('notes.md', 'v1', 'original'));
    await second;

    expect(sent).toEqual([update('notes.md', 'v1', 'original'), update('notes.md', 'v2', 'v1')]);
  });

  it('empties the session on flush and leaves other sessions staged', async () => {
    const { outbox, sent } = createOutbox();
    outbox.stage('a', update('notes.md', 'a1', null));
    outbox.stage('b', update('notes.md', 'b1', null));

    await outbox.flush('a');
    expect(sent).toEqual([update('notes.md', 'a1', null)]);
    await outbox.flush('a');
    expect(sent).toHaveLength(1);
    await outbox.flush('b');
    expect(sent).toEqual([update('notes.md', 'a1', null), update('notes.md', 'b1', null)]);
  });

  it('drops an update whose disk read failed without losing the rest', async () => {
    const { outbox, sent } = createOutbox();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    outbox.stage('session', Promise.reject(new Error('read failed')));
    outbox.stage('session', update('notes.md', 'v1', null));
    await outbox.flush('session');

    expect(sent).toEqual([update('notes.md', 'v1', null)]);
  });
});
