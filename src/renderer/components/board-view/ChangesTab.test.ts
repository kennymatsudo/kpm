import { describe, expect, it } from 'vitest';
import { shouldShowDiffLoading } from './ChangesTab';

describe('shouldShowDiffLoading', () => {
  it('keeps the current diff visible while a refresh is in flight', () => {
    expect(shouldShowDiffLoading('diff --git a/src/file.ts b/src/file.ts', true)).toBe(false);
  });

  it('shows the loading state before the first diff arrives', () => {
    expect(shouldShowDiffLoading(undefined, true)).toBe(true);
  });
});
