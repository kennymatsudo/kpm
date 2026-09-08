import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileNode } from '../../../shared/types';
import * as gitUtils from './gitUtils';
import {
  invalidateIgnoreCache,
  markIgnoredNodes,
  resolveGitRoot,
  resolveIgnoredPaths,
} from './ignoreSet';

vi.mock('./gitUtils', () => ({
  getIgnoredPaths: vi.fn(),
  findEnclosingGitRoot: vi.fn(),
}));

const getIgnoredPathsMock = vi.mocked(gitUtils.getIgnoredPaths);
const findEnclosingGitRootMock = vi.mocked(gitUtils.findEnclosingGitRoot);

beforeEach(() => {
  vi.clearAllMocks();
  invalidateIgnoreCache();
});

describe('resolveIgnoredPaths', () => {
  const gitRoot = '/repo';

  it('spawns git once, not once per call, for repeated resolution of the same paths', async () => {
    getIgnoredPathsMock.mockResolvedValue(new Set(['dist/out.js']));

    const first = await resolveIgnoredPaths(gitRoot, ['dist/out.js', 'src/index.ts']);
    const second = await resolveIgnoredPaths(gitRoot, ['dist/out.js', 'src/index.ts']);

    expect(first).toEqual(new Set(['dist/out.js']));
    expect(second).toEqual(new Set(['dist/out.js']));
    expect(getIgnoredPathsMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-query a path already known to be not-ignored', async () => {
    getIgnoredPathsMock.mockResolvedValue(new Set());

    const first = await resolveIgnoredPaths(gitRoot, ['src/index.ts']);
    const second = await resolveIgnoredPaths(gitRoot, ['src/index.ts']);

    expect(first).toEqual(new Set());
    expect(second).toEqual(new Set());
    expect(getIgnoredPathsMock).toHaveBeenCalledTimes(1);
  });

  it('sends only unknown paths to git when a call mixes known and unknown paths', async () => {
    getIgnoredPathsMock.mockResolvedValueOnce(new Set(['dist/out.js']));
    await resolveIgnoredPaths(gitRoot, ['dist/out.js']);

    getIgnoredPathsMock.mockResolvedValueOnce(new Set());
    const result = await resolveIgnoredPaths(gitRoot, ['dist/out.js', 'src/index.ts']);

    expect(getIgnoredPathsMock).toHaveBeenCalledTimes(2);
    expect(getIgnoredPathsMock).toHaveBeenLastCalledWith(gitRoot, ['src/index.ts']);
    expect(result).toEqual(new Set(['dist/out.js']));
  });

  it('spawns nothing when every path is already known', async () => {
    getIgnoredPathsMock.mockResolvedValueOnce(new Set(['dist/out.js']));
    await resolveIgnoredPaths(gitRoot, ['dist/out.js', 'src/index.ts']);
    getIgnoredPathsMock.mockClear();

    await resolveIgnoredPaths(gitRoot, ['dist/out.js', 'src/index.ts']);

    expect(getIgnoredPathsMock).not.toHaveBeenCalled();
  });

  describe('invalidateIgnoreCache', () => {
    it('forces a re-query for the invalidated repo', async () => {
      getIgnoredPathsMock.mockResolvedValue(new Set(['dist/out.js']));
      await resolveIgnoredPaths(gitRoot, ['dist/out.js']);

      invalidateIgnoreCache(gitRoot);
      await resolveIgnoredPaths(gitRoot, ['dist/out.js']);

      expect(getIgnoredPathsMock).toHaveBeenCalledTimes(2);
    });

    it('with no argument drops every repo entry', async () => {
      getIgnoredPathsMock.mockResolvedValue(new Set());
      await resolveIgnoredPaths('/repo-a', ['a.ts']);
      await resolveIgnoredPaths('/repo-b', ['b.ts']);
      getIgnoredPathsMock.mockClear();

      invalidateIgnoreCache();

      await resolveIgnoredPaths('/repo-a', ['a.ts']);
      await resolveIgnoredPaths('/repo-b', ['b.ts']);

      expect(getIgnoredPathsMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('resolveGitRoot', () => {
  it('memoises the synchronous walk to the filesystem root', () => {
    findEnclosingGitRootMock.mockReturnValue('/memo-repo');

    const first = resolveGitRoot('/memo-repo/src');
    const second = resolveGitRoot('/memo-repo/src');

    expect(first).toBe('/memo-repo');
    expect(second).toBe('/memo-repo');
    expect(findEnclosingGitRootMock).toHaveBeenCalledTimes(1);
  });
});

function makeNode(overrides: Partial<FileNode> & Pick<FileNode, 'name' | 'path' | 'isDirectory'>): FileNode {
  return {
    isSymlink: false,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    size: 0,
    ...overrides,
  };
}

describe('markIgnoredNodes', () => {
  it('marks ignored nodes in-place, including nested children, resolved relative to gitRoot', async () => {
    getIgnoredPathsMock.mockResolvedValue(new Set(['pkg/dist/out.js']));

    const nodes: FileNode[] = [
      makeNode({
        name: 'dist',
        path: 'dist',
        isDirectory: true,
        children: [makeNode({ name: 'out.js', path: 'dist/out.js', isDirectory: false })],
      }),
      makeNode({ name: 'index.ts', path: 'index.ts', isDirectory: false }),
    ];

    await markIgnoredNodes(nodes, '/repo/pkg', '/repo');

    expect(nodes[0].isIgnored).toBeUndefined();
    expect(nodes[0].children![0].isIgnored).toBe(true);
    expect(nodes[1].isIgnored).toBeUndefined();
  });

  it('fails open without throwing when git is unavailable', async () => {
    getIgnoredPathsMock.mockResolvedValue(new Set());

    const nodes: FileNode[] = [makeNode({ name: 'index.ts', path: 'index.ts', isDirectory: false })];

    await expect(markIgnoredNodes(nodes, '/repo', '/repo')).resolves.toBeUndefined();
    expect(nodes[0].isIgnored).toBeUndefined();
  });
});
