import { describe, expect, it } from 'vitest';
import { shouldShowDiffLoading, splitDiffLine } from './ChangesTab';

describe('splitDiffLine', () => {
  it.each([
    ['+const added = 1;', '+', 'const added = 1;'],
    ['-const removed = 1;', '-', 'const removed = 1;'],
    [' const context = 1;', ' ', 'const context = 1;'],
  ])('strips the marker column from %s', (line, marker, text) => {
    expect(splitDiffLine(line)).toEqual({ marker, text });
  });

  it.each([
    '@@ -12,7 +12,9 @@ function run() {',
    'diff --git a/src/file.ts b/src/file.ts',
    '--- a/src/file.ts',
    '+++ b/src/file.ts',
    '\\ No newline at end of file',
  ])('keeps every character of the header line %s', (line) => {
    expect(splitDiffLine(line)).toEqual({ marker: ' ', text: line });
  });
});

describe('shouldShowDiffLoading', () => {
  it('keeps the current diff visible while a refresh is in flight', () => {
    expect(shouldShowDiffLoading('diff --git a/src/file.ts b/src/file.ts', true)).toBe(false);
  });

  it('shows the loading state before the first diff arrives', () => {
    expect(shouldShowDiffLoading(undefined, true)).toBe(true);
  });
});
