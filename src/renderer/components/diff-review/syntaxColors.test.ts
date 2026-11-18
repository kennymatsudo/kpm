import { describe, expect, it } from 'vitest';
import { MAX_COLORIZE_LINES, languageIdForPath, splitColorizedHtml } from './syntaxColors';

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

  it('returns null when the line count differs', () => {
    expect(splitColorizedHtml('a<br/>b', 3)).toBeNull();
  });
});

describe('MAX_COLORIZE_LINES', () => {
  it('is 5000', () => {
    expect(MAX_COLORIZE_LINES).toBe(5000);
  });
});
