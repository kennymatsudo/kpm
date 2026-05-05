import { describe, expect, it } from 'vitest';
import { getCommonDevToolPaths } from './findClaude';

describe('getCommonDevToolPaths', () => {
  it('returns POSIX paths on darwin/linux', () => {
    if (process.platform === 'win32') return;
    const paths = getCommonDevToolPaths();
    expect(paths).toContain('/opt/homebrew/bin');
    expect(paths).toContain('/usr/local/bin');
    expect(paths.some(p => p.endsWith('.volta/bin'))).toBe(true);
    expect(paths.some(p => p.endsWith('.asdf/shims'))).toBe(true);
    expect(paths.some(p => p.endsWith('.bun/bin'))).toBe(true);
  });

  it('includes pnpm and Yarn install locations', () => {
    if (process.platform === 'win32') return;
    const paths = getCommonDevToolPaths();
    expect(paths.some(p => p.endsWith('.yarn/bin'))).toBe(true);
    expect(paths.some(p => p.includes('pnpm'))).toBe(true);
  });

  it('returns no duplicate entries', () => {
    const paths = getCommonDevToolPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });
});

