import { describe, expect, it } from 'vitest';
import {
  writeInitialProjectContextFileSync,
  writeProjectContextFileSync,
  type ProjectContextFileSyncFs,
} from './projectContextFile';

function createMockFs(initial: Record<string, string> = {}): ProjectContextFileSyncFs & {
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
  };
}

const FOLDER = '/tmp/project';
const PRIMARY_PATH = '/tmp/project/AGENTS.md';
const COMPAT_PATH = '/tmp/project/CLAUDE.md';

describe('writeInitialProjectContextFileSync', () => {
  it('writes AGENTS.md when neither file exists', () => {
    const fsImpl = createMockFs();
    writeInitialProjectContextFileSync(fsImpl, FOLDER, '# Project');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# Project');
    expect(fsImpl.writes.has(COMPAT_PATH)).toBe(false);
  });

  it('leaves an upstream CLAUDE.md-only project alone', () => {
    const fsImpl = createMockFs({ [COMPAT_PATH]: '# Upstream claude' });
    writeInitialProjectContextFileSync(fsImpl, FOLDER, '# Replacement');
    expect(fsImpl.writes.has(PRIMARY_PATH)).toBe(false);
    expect(fsImpl.writes.get(COMPAT_PATH)).toBe('# Upstream claude');
  });

  it('leaves an upstream AGENTS.md project alone', () => {
    const fsImpl = createMockFs({ [PRIMARY_PATH]: '# Upstream agents' });
    writeInitialProjectContextFileSync(fsImpl, FOLDER, '# Replacement');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# Upstream agents');
    expect(fsImpl.writes.has(COMPAT_PATH)).toBe(false);
  });
});

describe('writeProjectContextFileSync (regen path)', () => {
  it('overwrites the primary file unconditionally', () => {
    const fsImpl = createMockFs({ [PRIMARY_PATH]: '# Old' });
    writeProjectContextFileSync(fsImpl, FOLDER, '# New');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# New');
  });

  it('migrates a legacy CLAUDE.md-only project to AGENTS.md without touching CLAUDE.md', () => {
    const fsImpl = createMockFs({ [COMPAT_PATH]: '# Legacy' });
    writeProjectContextFileSync(fsImpl, FOLDER, '# New');
    expect(fsImpl.writes.get(PRIMARY_PATH)).toBe('# New');
    expect(fsImpl.writes.get(COMPAT_PATH)).toBe('# Legacy');
  });

  it('does not create a CLAUDE.md mirror', () => {
    const fsImpl = createMockFs();
    writeProjectContextFileSync(fsImpl, FOLDER, '# New');
    expect(fsImpl.writes.has(COMPAT_PATH)).toBe(false);
  });
});
