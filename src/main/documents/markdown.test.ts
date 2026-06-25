import { describe, it, expect } from 'vitest';
import { normalizeMarkdown } from './markdown';

describe('normalizeMarkdown', () => {
  it('passes through null/undefined unchanged', () => {
    expect(normalizeMarkdown(null)).toBeNull();
    expect(normalizeMarkdown(undefined)).toBeNull();
  });

  it('canonicalizes `*` and `+` bullets to `-` (the Linear round-trip case)', () => {
    const kpm = '## Verification\n\n* runs pytest\n+ survives refetch';
    const linear = '## Verification\n\n- runs pytest\n- survives refetch';
    expect(normalizeMarkdown(kpm)).toBe(normalizeMarkdown(linear));
    expect(normalizeMarkdown(kpm)).toBe(linear);
  });

  it('canonicalizes nested/indented bullets', () => {
    expect(normalizeMarkdown('- top\n  * nested\n    + deeper')).toBe(
      '- top\n  - nested\n    - deeper'
    );
  });

  it('leaves task-list checkboxes intact while normalizing the marker', () => {
    expect(normalizeMarkdown('* [ ] todo\n* [x] done')).toBe('- [ ] todo\n- [x] done');
  });

  it('does not touch emphasis or inline asterisks', () => {
    expect(normalizeMarkdown('This is *italic* and **bold** text')).toBe(
      'This is *italic* and **bold** text'
    );
    expect(normalizeMarkdown('a * b * c')).toBe('a * b * c');
  });

  it('preserves thematic breaks (horizontal rules)', () => {
    expect(normalizeMarkdown('above\n\n***\n\nbelow')).toBe('above\n\n***\n\nbelow');
    expect(normalizeMarkdown('above\n\n* * *\n\nbelow')).toBe('above\n\n* * *\n\nbelow');
    expect(normalizeMarkdown('above\n\n---\n\nbelow')).toBe('above\n\n---\n\nbelow');
  });

  it('normalizes line endings and trailing whitespace', () => {
    expect(normalizeMarkdown('line one  \r\nline two\t\r\n')).toBe('line one\nline two');
  });

  it('trims leading and trailing blank lines', () => {
    expect(normalizeMarkdown('\n\n* item\n\n')).toBe('- item');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeMarkdown('   \n  ')).toBe('');
    expect(normalizeMarkdown('')).toBe('');
  });

  it('is idempotent', () => {
    const input = '## Title\n\n* one\n+ two\n\n* * *\n';
    const once = normalizeMarkdown(input);
    expect(normalizeMarkdown(once)).toBe(once);
  });
});
