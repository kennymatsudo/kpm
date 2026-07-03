import { describe, expect, it } from 'vitest';
import { isSafeRelativePath, normalizePosixPath } from './relativePath';

describe('normalizePosixPath', () => {
  it('matches Node path.posix.normalize for relative inputs', () => {
    const cases: [string, string][] = [
      ['.', '.'],
      ['./', './'],
      ['..', '..'],
      ['../', '../'],
      ['a', 'a'],
      ['a/', 'a/'],
      ['./a', 'a'],
      ['./a/', 'a/'],
      ['a/.', 'a'],
      ['a/./', 'a/'],
      ['a/..', '.'],
      ['a/../', './'],
      ['a/b', 'a/b'],
      ['a/b/', 'a/b/'],
      ['a/b/..', 'a'],
      ['a/b/../', 'a/'],
      ['a/b/../c', 'a/c'],
      ['a/b/../c/', 'a/c/'],
      ['../a', '../a'],
      ['../a/', '../a/'],
      ['../..', '../..'],
      ['../../', '../../'],
      ['a/../..', '..'],
      ['a/../../', '../'],
      ['.//', './'],
      ['.//.', '.'],
      ['a//b', 'a/b'],
      ['a///b//', 'a/b/'],
      ['a/b/../../', './'],
      ['a/b/../..', '.'],
      ['../../..', '../../..'],
      ['../../../', '../../../'],
    ];

    for (const [input, expected] of cases) {
      expect(normalizePosixPath(input), `normalizePosixPath(${JSON.stringify(input)})`).toBe(expected);
    }
  });

  it('matches Node path.posix.normalize for absolute inputs', () => {
    const cases: [string, string][] = [
      ['/', '/'],
      ['/a/', '/a/'],
      ['/a/..', '/'],
      ['/a/../', '/'],
      ['/..', '/'],
      ['/../', '/'],
    ];

    for (const [input, expected] of cases) {
      expect(normalizePosixPath(input), `normalizePosixPath(${JSON.stringify(input)})`).toBe(expected);
    }
  });
});

describe('isSafeRelativePath', () => {
  it('accepts canonical relative paths', () => {
    expect(isSafeRelativePath('')).toBe(true);
    expect(isSafeRelativePath('a')).toBe(true);
    expect(isSafeRelativePath('a/b')).toBe(true);
    expect(isSafeRelativePath('a/')).toBe(true);
    expect(isSafeRelativePath('./')).toBe(true);
  });

  it('rejects paths that are not already normalized', () => {
    expect(isSafeRelativePath('./a')).toBe(false);
    expect(isSafeRelativePath('a/./b')).toBe(false);
    expect(isSafeRelativePath('a//b')).toBe(false);
    expect(isSafeRelativePath('a/../b')).toBe(false);
  });

  it('rejects traversal and absolute paths', () => {
    expect(isSafeRelativePath('..')).toBe(false);
    expect(isSafeRelativePath('../a')).toBe(false);
    expect(isSafeRelativePath('.')).toBe(false);
    expect(isSafeRelativePath('/a')).toBe(false);
    expect(isSafeRelativePath('C:/a')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isSafeRelativePath('a\0b')).toBe(false);
  });
});
