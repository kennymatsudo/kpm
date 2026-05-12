import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  listScopedDirectory,
  resolveLexicalScopedPath,
  resolveScopedPath,
} from '../../src/main/services/files/scopedFs';

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
    const resolvedProjectDir = fs.realpathSync.native(projectDir);
    const result = resolveScopedPath(projectDir, 'docs/guide.md');

    expect(result.valid).toBe(true);
    expect(result.fullPath.startsWith(resolvedProjectDir)).toBe(true);
  });

  it('rejects traversal outside project root', () => {
    const projectDir = mkTemp('scoped-fs-project-');
    const result = resolveScopedPath(projectDir, '../secrets.txt');

    expect(result.valid).toBe(false);
  });

  it('rejects explicit absolute paths', () => {
    const projectDir = mkTemp('scoped-fs-project-');
    const result = resolveScopedPath(projectDir, '/etc/passwd');

    expect(result.valid).toBe(false);
  });

  it('rejects a symlink that resolves outside project root', () => {
    const projectDir = mkTemp('scoped-fs-project-');
    const outsideDir = mkTemp('scoped-fs-outside-');
    const outsideFile = path.join(outsideDir, 'notes.txt');
    fs.writeFileSync(outsideFile, 'external content', 'utf-8');

    const linkPath = path.join(projectDir, 'notes.txt');
    fs.symlinkSync(outsideFile, linkPath);

    const result = resolveScopedPath(projectDir, 'notes.txt');
    expect(result.valid).toBe(false);
  });

  it('rejects paths under a symlinked directory that points outside', () => {
    const projectDir = mkTemp('scoped-fs-project-');
    const outsideDir = mkTemp('scoped-fs-outside-');
    fs.writeFileSync(path.join(outsideDir, 'existing.md'), 'hello', 'utf-8');

    const linkDirPath = path.join(projectDir, 'shared');
    fs.symlinkSync(outsideDir, linkDirPath);

    const existing = resolveScopedPath(projectDir, 'shared/existing.md');
    expect(existing.valid).toBe(false);

    const created = resolveScopedPath(projectDir, 'shared/new-file.md');
    expect(created.valid).toBe(false);
  });
});

describe('resolveLexicalScopedPath', () => {
  it('accepts an in-project symlink while preserving the lexical link path', () => {
    const projectDir = mkTemp('lexical-scoped-fs-project-');
    const outsideDir = mkTemp('lexical-scoped-fs-outside-');
    const outsideFile = path.join(outsideDir, 'notes.txt');
    fs.writeFileSync(outsideFile, 'external content', 'utf-8');

    fs.symlinkSync(outsideFile, path.join(projectDir, 'notes.txt'));

    const result = resolveLexicalScopedPath(projectDir, 'notes.txt');
    expect(result.valid).toBe(true);
    expect(result.fullPath).toBe(path.resolve(projectDir, 'notes.txt'));
    expect(fs.readFileSync(result.fullPath, 'utf-8')).toBe('external content');
  });

  it('accepts lexical paths under a symlinked directory', () => {
    const projectDir = mkTemp('lexical-scoped-fs-project-');
    const outsideDir = mkTemp('lexical-scoped-fs-outside-');
    fs.writeFileSync(path.join(outsideDir, 'existing.md'), 'hello', 'utf-8');

    fs.symlinkSync(outsideDir, path.join(projectDir, 'shared'));

    const existing = resolveLexicalScopedPath(projectDir, 'shared/existing.md');
    expect(existing.valid).toBe(true);
    expect(existing.fullPath).toBe(path.resolve(projectDir, 'shared/existing.md'));

    const created = resolveLexicalScopedPath(projectDir, 'shared/new-file.md');
    expect(created.valid).toBe(true);
  });
});

describe('listScopedDirectory symlink-depth cap', () => {
  it('expands a single-hop symlinked directory but stops at nested symlinks', async () => {
    const project = mkTemp('list-cap-proj-');
    const outerExternal = mkTemp('list-cap-out-');
    const innerExternal = mkTemp('list-cap-inner-');

    fs.writeFileSync(path.join(outerExternal, 'outer.md'), 'a', 'utf-8');
    fs.writeFileSync(path.join(innerExternal, 'inner.md'), 'b', 'utf-8');
    fs.symlinkSync(innerExternal, path.join(outerExternal, 'nested-link'));
    fs.symlinkSync(outerExternal, path.join(project, 'first-link'));

    const tree = await listScopedDirectory({
      rootPath: project,
      directoryPath: project,
      recursive: true,
      maxDepth: 10,
      maxSymlinkDepth: 1,
      shouldHideEntry: () => false,
    });

    const firstLink = tree.find((n) => n.name === 'first-link');
    expect(firstLink).toBeDefined();
    expect(firstLink!.isSymlink).toBe(true);
    expect(firstLink!.children?.some((c) => c.name === 'outer.md')).toBe(true);

    const nestedLink = firstLink!.children?.find((c) => c.name === 'nested-link');
    expect(nestedLink?.isSymlink).toBe(true);
    // Hit the cap — second-hop symlink is shown but not expanded.
    expect(nestedLink?.children).toBeUndefined();
  });

  it('does not expand a symlinked directory when maxSymlinkDepth is 0', async () => {
    const project = mkTemp('list-cap-zero-');
    const outsideDir = mkTemp('list-cap-zero-out-');
    fs.writeFileSync(path.join(outsideDir, 'x.md'), 'x', 'utf-8');
    fs.symlinkSync(outsideDir, path.join(project, 'linked'));

    const tree = await listScopedDirectory({
      rootPath: project,
      directoryPath: project,
      recursive: true,
      maxDepth: 10,
      maxSymlinkDepth: 0,
      shouldHideEntry: () => false,
    });

    const linked = tree.find((n) => n.name === 'linked');
    expect(linked?.isSymlink).toBe(true);
    expect(linked?.children).toBeUndefined();
  });
});
