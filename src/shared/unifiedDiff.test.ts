import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './unifiedDiff';

const ROOT = '/repo';

describe('parseUnifiedDiff', () => {
  it('parses a modified file with line numbers on both sides', () => {
    const text = [
      'diff --git a/src/a.py b/src/a.py',
      'index 111..222 100644',
      '--- a/src/a.py',
      '+++ b/src/a.py',
      '@@ -1,3 +1,3 @@',
      ' keep',
      '-old',
      '+new',
      ' tail',
      '',
    ].join('\n');
    const [file] = parseUnifiedDiff(text, ROOT);
    expect(file).toMatchObject({ rootPath: ROOT, path: 'src/a.py', status: 'modified', additions: 1, deletions: 1, binary: false });
    expect(file.hunks[0].lines).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'keep' },
      { kind: 'del', oldLine: 2, newLine: null, text: 'old' },
      { kind: 'add', oldLine: null, newLine: 2, text: 'new' },
      { kind: 'context', oldLine: 3, newLine: 3, text: 'tail' },
    ]);
  });

  it('marks added, deleted, renamed, and binary files', () => {
    const text = [
      'diff --git a/new.md b/new.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.md',
      '@@ -0,0 +1,2 @@',
      '+# Title',
      '+body',
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-bye',
      'diff --git a/old name.ts b/new name.ts',
      'similarity index 100%',
      'rename from old name.ts',
      'rename to new name.ts',
      'diff --git a/img.png b/img.png',
      'Binary files a/img.png and b/img.png differ',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(text, ROOT);
    expect(files.map((f) => [f.path, f.status, f.additions, f.deletions, f.binary])).toEqual([
      ['new.md', 'added', 2, 0, false],
      ['gone.txt', 'deleted', 0, 1, false],
      ['new name.ts', 'renamed', 0, 0, false],
      ['img.png', 'modified', 0, 0, true],
    ]);
    expect(files[2].oldPath).toBe('old name.ts');
  });

  it('ignores the no-newline marker', () => {
    const text = [
      'diff --git a/a b/a',
      '--- a/a',
      '+++ b/a',
      '@@ -1 +1 @@',
      '-x',
      '\\ No newline at end of file',
      '+y',
      '',
    ].join('\n');
    const [file] = parseUnifiedDiff(text, ROOT);
    expect(file.hunks[0].lines.map((l) => l.kind)).toEqual(['del', 'add']);
  });

  it('returns an empty list for empty input', () => {
    expect(parseUnifiedDiff('', ROOT)).toEqual([]);
  });
});
