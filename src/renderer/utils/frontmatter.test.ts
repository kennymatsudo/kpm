import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
  it('returns the whole content as body when there is no frontmatter', () => {
    const content = '# Title\n\nSome text.';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: null, body: content });
  });

  it('splits a standard frontmatter block', () => {
    const content = '---\ntitle: Hello\ntags:\n  - a\n  - b\n---\n# Title\n\nBody.';
    expect(splitFrontmatter(content)).toEqual({
      frontmatter: 'title: Hello\ntags:\n  - a\n  - b',
      body: '# Title\n\nBody.',
    });
  });

  it('handles CRLF line endings', () => {
    const content = '---\r\ntitle: Hello\r\n---\r\n# Title';
    const result = splitFrontmatter(content);
    expect(result.frontmatter).toBe('title: Hello\r');
    expect(result.body).toBe('# Title');
  });

  it('handles a frontmatter-only document', () => {
    const content = '---\nname: thing\n---';
    expect(splitFrontmatter(content)).toEqual({
      frontmatter: 'name: thing',
      body: '',
    });
  });

  it('ignores an unclosed fence', () => {
    const content = '---\ntitle: Hello\n# Never closed';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: null, body: content });
  });

  it('ignores a fence pair with no YAML keys between them', () => {
    const content = '---\n---\n# Title';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: null, body: content });
  });

  it('ignores a document opening with a horizontal rule followed by prose', () => {
    const content = '---\n\nJust some text without keys.\n\n---\nMore text.';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: null, body: content });
  });

  it('requires the first line to be exactly ---', () => {
    const content = '----\ntitle: Hello\n---\nBody';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: null, body: content });

    const indented = ' ---\ntitle: Hello\n---\nBody';
    expect(splitFrontmatter(indented)).toEqual({ frontmatter: null, body: indented });
  });

  it('gives up when the closing fence is too far away', () => {
    const content = '---\ntitle: Hello\n' + 'filler\n'.repeat(60) + '---\nBody';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: null, body: content });
  });

  it('treats a later --- as a horizontal rule, not a new block', () => {
    const content = '---\ntitle: Hello\n---\nIntro\n\n---\n\nOutro';
    expect(splitFrontmatter(content)).toEqual({
      frontmatter: 'title: Hello',
      body: 'Intro\n\n---\n\nOutro',
    });
  });
});
