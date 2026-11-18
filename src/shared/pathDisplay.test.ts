import { describe, expect, it } from 'vitest';
import { splitForDisplay } from './pathDisplay';

describe('splitForDisplay', () => {
  it('splits a nested path', () => {
    expect(splitForDisplay('src/main/a.ts')).toEqual({ dir: 'src/main/', base: 'a.ts' });
  });

  it('returns an empty directory for a bare file name', () => {
    expect(splitForDisplay('README.md')).toEqual({ dir: '', base: 'README.md' });
  });
});
