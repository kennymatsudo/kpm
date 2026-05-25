import { describe, expect, it } from 'vitest';
import {
  writeInitialProjectContextFilesSync,
  writeProjectContextFilesSync,
  type ContextFileCompatSyncFs,
} from './contextFileCompat';

function createMockFs(initial: Record<string, string> = {}): ContextFileCompatSyncFs & {
  writes: Map<string, string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    writes: files,
    existsSync(p: string) {
      return files.has(p);
    },
    writeFileSync(p: string, content: string) {
      files.set(p, content);
    },
    symlinkSync() {
      // pretend symlinks aren't supported so the compat path falls back to writeFile
      const err: NodeJS.ErrnoException = new Error('EPERM');
      err.code = 'EPERM';
      throw err;
    },
  };
}

const FOLDER = '/tmp/project';
const PRIMARY_PATH = '/tmp/project/AGENTS.md';
const COMPAT_PATH = '/tmp/project/CLAUDE.md';

describe('writeInitialProjectContextFilesSync', () => {
  it('writes both context files when neither exists', () => {
    const fsImpl = createMockFs();
    writeInitialProjectContextFilesSync(fsImpl, FOLDER, '# Project');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# Project');
    expect(fsImpl.writes.has(COMPAT_PATH)).toBe(true);
  });

  it('skips when an upstream CLAUDE.md is already present', () => {
    const fsImpl = createMockFs({ [COMPAT_PATH]: '# Upstream claude' });
    writeInitialProjectContextFilesSync(fsImpl, FOLDER, '# Replacement');
    expect(fsImpl.writes.has(PRIMARY_PATH)).toBe(false);
    expect(fsImpl.writes.get(COMPAT_PATH)).toBe('# Upstream claude');
  });

  it('skips when an upstream AGENTS.md is already present', () => {
    const fsImpl = createMockFs({ [PRIMARY_PATH]: '# Upstream agents' });
    writeInitialProjectContextFilesSync(fsImpl, FOLDER, '# Replacement');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# Upstream agents');
    expect(fsImpl.writes.has(COMPAT_PATH)).toBe(false);
  });
});

describe('writeProjectContextFilesSync (regen path)', () => {
  it('overwrites the primary file unconditionally', () => {
    const fsImpl = createMockFs({ [PRIMARY_PATH]: '# Old' });
    writeProjectContextFilesSync(fsImpl, FOLDER, '# New');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# New');
  });
});

