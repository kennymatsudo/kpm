import { describe, expect, it } from 'vitest';
import { findPinnedPromptId, type TranscriptRow } from './pinnedPrompt';

const rows: TranscriptRow[] = [
  { id: 'u1', role: 'user', top: 0, height: 100 },
  { id: 'a1', role: 'assistant', top: 100, height: 900 },
  { id: 'u2', role: 'user', top: 1000, height: 100 },
  { id: 'a2', role: 'assistant', top: 1100, height: 2000 },
];

describe('findPinnedPromptId', () => {
  it('pins nothing while the question is still on screen', () => {
    expect(findPinnedPromptId(rows, 0)).toBeNull();
    expect(findPinnedPromptId(rows, 99)).toBeNull();
  });

  it('pins the question once it scrolls fully off the top', () => {
    expect(findPinnedPromptId(rows, 100)).toBe('u1');
    expect(findPinnedPromptId(rows, 950)).toBe('u1');
  });

  it('hands over to the next question when its answer reaches the top', () => {
    expect(findPinnedPromptId(rows, 1050)).toBeNull();
    expect(findPinnedPromptId(rows, 2500)).toBe('u2');
  });

  it('keeps the last question pinned below the transcript, where the live turn streams', () => {
    expect(findPinnedPromptId(rows, 5000)).toBe('u2');
  });

  it('pins nothing above the first question', () => {
    expect(
      findPinnedPromptId([{ id: 'a0', role: 'assistant', top: 0, height: 500 }], 300)
    ).toBeNull();
  });
});
