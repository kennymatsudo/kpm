import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempRoots: string[] = [];

function mkTemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempRoots) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  tempRoots = [];
});

describe('resolveScopedPath', () => {
  it('accepts a normal in-project path', () => {
    const projectDir = mkTemp('scoped-fs-project-');
    const result = resolveScopedPath(projectDir, 'docs/guide.md');

    expect(result.valid).toBe(true);
    expect(result.fullPath.startsWith(resolvedProjectDir)).toBe(true);
  });

  it('rejects traversal outside project root', () => {
    const projectDir = mkTemp('scoped-fs-project-');
    const result = resolveScopedPath(projectDir, '../secrets.txt');

    expect(result.valid).toBe(false);
  });

    const projectDir = mkTemp('scoped-fs-project-');
    const outsideDir = mkTemp('scoped-fs-outside-');

    fs.symlinkSync(outsideFile, linkPath);

  });

    const projectDir = mkTemp('scoped-fs-project-');
    const outsideDir = mkTemp('scoped-fs-outside-');
    fs.symlinkSync(outsideDir, linkDirPath);

  });
});
