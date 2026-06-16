import { describe, it, expect } from 'vitest';
import { slugify, extractHeadings } from './headingOutline';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Design Summary')).toBe('design-summary');
  });

  it('drops punctuation and emphasis markers', () => {
    expect(slugify('**Bold** & `code`!')).toBe('bold-code');
  });

  it('collapses and trims hyphens', () => {
    expect(slugify('  Foo --- Bar  ')).toBe('foo-bar');
  });

  it('keeps underscores (word chars)', () => {
    expect(slugify('support_file block')).toBe('support_file-block');
  });
});

describe('extractHeadings', () => {
  it('extracts level, text, and slug id', () => {
    const headings = extractHeadings('# Title\n\n## Goal\n\nbody\n\n### Detail');
    expect(headings).toEqual([
      { level: 1, text: 'Title', id: 'title' },
      { level: 2, text: 'Goal', id: 'goal' },
      { level: 3, text: 'Detail', id: 'detail' },
    ]);
  });

  it('dedupes repeated slugs in document order', () => {
    const headings = extractHeadings('# Notes\n## Notes\n## Notes');
    expect(headings.map((h) => h.id)).toEqual(['notes', 'notes-1', 'notes-2']);
  });

  it('skips headings inside fenced code blocks', () => {
    const md = '# Real\n\n```\n# Not A Heading\n```\n\n## Also Real';
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['Real', 'Also Real']);
  });

  it('strips inline markdown from the label and the slug', () => {
    const headings = extractHeadings('## The `support_file` block');
    expect(headings[0]).toEqual({
      level: 2,
      text: 'The support_file block',
      id: 'the-support_file-block',
    });
  });

  it('returns empty when there are no headings', () => {
    expect(extractHeadings('just text\nno headings here')).toEqual([]);
  });
});
