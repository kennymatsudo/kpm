import { describe, expect, it } from 'vitest';
import type { Stats } from 'fs';
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

  it('creates the compat file as a symlink to the primary file when symlinks are supported', () => {
    const files = new Map<string, string>();
    const symlinks = new Map<string, string>();
    const fsImpl: ContextFileCompatSyncFs = {
      existsSync: (p) => files.has(p) || symlinks.has(p),
      writeFileSync: (p, content) => {
        files.set(p, content);
      },
      symlinkSync: (target, p) => {
        symlinks.set(p, target);
      },
    };

    writeProjectContextFilesSync(fsImpl, FOLDER, '# New');

    expect(files.get(PRIMARY_PATH)).toBe('# New');
    expect(symlinks.get(COMPAT_PATH)).toBe('AGENTS.md');
    // The write-fallback path must not have also fired.
    expect(files.has(COMPAT_PATH)).toBe(false);
  });

  it('leaves an existing compat symlink that already resolves to the primary file untouched', () => {
    const files = new Map<string, string>([[PRIMARY_PATH, '# Old']]);
    const symlinks = new Map<string, string>([[COMPAT_PATH, 'AGENTS.md']]);
    let unlinkCalls = 0;
    let symlinkCalls = 0;
    const fsImpl: ContextFileCompatSyncFs = {
      existsSync: (p) => files.has(p) || symlinks.has(p),
      writeFileSync: (p, content) => {
        files.set(p, content);
      },
      lstatSync: (p) =>
        ({
          isDirectory: () => false,
          isSymbolicLink: () => symlinks.has(p),
        }) as Stats,
      readlinkSync: (p) => symlinks.get(p) ?? '',
      unlinkSync: () => {
        unlinkCalls++;
      },
      symlinkSync: () => {
        symlinkCalls++;
      },
    };

    writeProjectContextFilesSync(fsImpl, FOLDER, '# New');

    expect(files.get(PRIMARY_PATH)).toBe('# New');
    // An already-correct symlink is left alone, not torn down and recreated.
    expect(unlinkCalls).toBe(0);
    expect(symlinkCalls).toBe(0);
  });
});

