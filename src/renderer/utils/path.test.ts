import { describe, it, expect } from 'vitest';
import { getBaseName, getParentPath, normalizePathSeparators } from './path';

describe('path utils', () => {
  it('normalizes Windows separators', () => {
    expect(normalizePathSeparators('C:\\repo\\docs\\README.md')).toBe('C:/repo/docs/README.md');
  });

  it('extracts basename from Unix and Windows paths', () => {
    expect(getBaseName('/Users/dev/project/file.ts')).toBe('file.ts');
    expect(getBaseName('C:\\repo\\docs\\README.md')).toBe('README.md');
  });

  it('handles trailing separators and fallback values', () => {
    expect(getBaseName('/Users/dev/project/')).toBe('project');
    expect(getBaseName('', 'Untitled')).toBe('Untitled');
  });

  it('extracts parent paths across platforms', () => {
    expect(getParentPath('/Users/dev/project/file.ts')).toBe('/Users/dev/project');
    expect(getParentPath('C:\\repo\\docs\\README.md')).toBe('C:/repo/docs');
    expect(getParentPath('README.md', '.')).toBe('.');
  });
});
