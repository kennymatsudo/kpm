import { describe, expect, it } from 'vitest';
import { splitMarkdownBlocks } from './markdownBlocks';

describe('splitMarkdownBlocks', () => {
  it('splits plain paragraphs on a blank line', () => {
    expect(splitMarkdownBlocks('para one\n\npara two')).toEqual(['para one', 'para two']);
  });

  it('splits a heading from the paragraph that follows it', () => {
    expect(splitMarkdownBlocks('# Heading\n\nSome paragraph.')).toEqual([
      '# Heading',
      'Some paragraph.',
    ]);
  });

  it('keeps a heading and paragraph together when there is no blank line', () => {
    expect(splitMarkdownBlocks('# Heading\nSome paragraph.')).toEqual([
      '# Heading\nSome paragraph.',
    ]);
  });

  it('keeps a fenced code block with an internal blank line as one block', () => {
    const text = 'before\n\n```\nline1\n\nline2\n```\n\nafter';
    expect(splitMarkdownBlocks(text)).toEqual(['before', '```\nline1\n\nline2\n```', 'after']);
  });

  it('absorbs an unterminated trailing fence into one final block', () => {
    const text = 'some text\n\n```\ncode without closing';
    expect(splitMarkdownBlocks(text)).toEqual(['some text', '```\ncode without closing']);
  });

  it('treats ~~~ fences the same as backtick fences', () => {
    const text = 'before\n\n~~~\nline1\n\nline2\n~~~\n\nafter';
    expect(splitMarkdownBlocks(text)).toEqual(['before', '~~~\nline1\n\nline2\n~~~', 'after']);
  });

  it('is atomic for a fenced block with a language suffix', () => {
    const text = '```ts\nconst x = 1;\n```';
    expect(splitMarkdownBlocks(text)).toEqual(['```ts\nconst x = 1;\n```']);
  });

  it('returns a single block when there are no blank lines', () => {
    expect(splitMarkdownBlocks('line one\nline two\nline three')).toEqual([
      'line one\nline two\nline three',
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitMarkdownBlocks('')).toEqual([]);
  });

  it('splits after a fence closes when more text follows a blank line', () => {
    const text = '```\ncode\n```\n\nmore text';
    expect(splitMarkdownBlocks(text)).toEqual(['```\ncode\n```', 'more text']);
  });

  it('does not split when text immediately follows a closed fence without a blank line', () => {
    const text = '```\ncode\n```\nmore text';
    expect(splitMarkdownBlocks(text)).toEqual(['```\ncode\n```\nmore text']);
  });

  it('drops extra blank lines between blocks without producing empty blocks', () => {
    expect(splitMarkdownBlocks('para one\n\n\n\npara two')).toEqual(['para one', 'para two']);
  });
});
