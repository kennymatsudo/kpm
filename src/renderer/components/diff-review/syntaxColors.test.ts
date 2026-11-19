import { describe, expect, it } from 'vitest';
import { MAX_COLORIZE_LINES, coloredHtmlForLine, languageIdForPath, sideTexts, splitColorizedHtml } from './syntaxColors';

const languages = [
  { id: 'plaintext', extensions: ['.txt'] },
  { id: 'python', extensions: ['.py', '.pyw'] },
  { id: 'typescript', extensions: ['.ts', '.tsx'] },
  { id: 'markdown', extensions: ['.md'] },
];

describe('languageIdForPath', () => {
  it('matches by extension, case-insensitively', () => {
    expect(languageIdForPath('a/b.PY', languages)).toBe('python');
    expect(languageIdForPath('x.tsx', languages)).toBe('typescript');
    expect(languageIdForPath('README.md', languages)).toBe('markdown');
  });

  it('returns null when nothing matches or the language is plaintext', () => {
    expect(languageIdForPath('a.unknown', languages)).toBeNull();
    expect(languageIdForPath('Makefile', languages)).toBeNull();
    expect(languageIdForPath('notes.txt', languages)).toBeNull();
  });
});

describe('splitColorizedHtml', () => {
  it('splits on br tags into one string per line', () => {
    expect(splitColorizedHtml('<span>a</span><br/><span>b</span>', 2)).toEqual(['<span>a</span>', '<span>b</span>']);
  });

  it('drops the break Monaco adds after the last line', () => {
    expect(splitColorizedHtml('<span>a</span><br/><span>b</span><br/>', 2)).toEqual(['<span>a</span>', '<span>b</span>']);
  });

  it('keeps an empty last line that is real', () => {
    expect(splitColorizedHtml('<span>a</span><br/><br/>', 2)).toEqual(['<span>a</span>', '']);
  });

  it('returns null when the line count differs', () => {
    expect(splitColorizedHtml('a<br/>b', 3)).toBeNull();
  });
});

describe('MAX_COLORIZE_LINES', () => {
  it('is 5000', () => {
    expect(MAX_COLORIZE_LINES).toBe(5000);
  });
});

const L = (kind: 'add' | 'del' | 'context', oldLine: number | null, newLine: number | null, text: string) => ({
  kind, oldLine, newLine, text,
});

describe('sideTexts and coloredHtmlForLine', () => {
  const hunks = [
    { lines: [L('context', 1, 1, 'a'), L('del', 2, null, 'b'), L('add', null, 2, 'B'), L('add', null, 3, 'C'), L('context', 3, 4, 'd')] },
    { lines: [L('del', 10, null, 'x'), L('context', 11, 11, 'y'), L('add', null, 12, 'z')] },
  ];
  const { oldSide, newSide } = sideTexts(hunks);

  it('splits each side across hunks', () => {
    expect(oldSide.text).toEqual(['a', 'b', 'd', 'x', 'y']);
    expect(newSide.text).toEqual(['a', 'B', 'C', 'd', 'y', 'z']);
  });

  it('maps colored line i back to the right line on each side', () => {
    const oldColors = oldSide.text.map((t) => `o:${t}`);
    const newColors = newSide.text.map((t) => `n:${t}`);
    const html = (line: ReturnType<typeof L>) => coloredHtmlForLine(line, oldSide, newSide, oldColors, newColors);
    expect(html(hunks[0].lines[0])).toBe('n:a');
    expect(html(hunks[0].lines[1])).toBe('o:b');
    expect(html(hunks[0].lines[2])).toBe('n:B');
    expect(html(hunks[0].lines[3])).toBe('n:C');
    expect(html(hunks[0].lines[4])).toBe('n:d');
    expect(html(hunks[1].lines[0])).toBe('o:x');
    expect(html(hunks[1].lines[1])).toBe('n:y');
    expect(html(hunks[1].lines[2])).toBe('n:z');
  });

  it('returns null without colors', () => {
    expect(coloredHtmlForLine(hunks[0].lines[0], oldSide, newSide, null, null)).toBeNull();
  });

  it('keeps escaped markup from source text inside its own line', () => {
    const escaped = '<span>&lt;/span&gt;&lt;br/&gt;</span><br/><span>next</span>';
    expect(splitColorizedHtml(escaped, 2)).toEqual(['<span>&lt;/span&gt;&lt;br/&gt;</span>', '<span>next</span>']);
  });
});
