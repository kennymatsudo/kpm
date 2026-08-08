import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from 'markdown-to-jsx';
import type { MarkdownToJSX } from 'markdown-to-jsx';
import { growingBlockMarkdownOptions, markdownOptions } from './markdown';
import { splitMarkdownBlocks } from './markdownBlocks';

const render = (text: string, options: MarkdownToJSX.Options = markdownOptions) =>
  renderToStaticMarkup(<Markdown options={options}>{text}</Markdown>);

/** markdown-to-jsx wraps a multi-child render in a bare div; a per-block render has no such parent. */
const unwrap = (html: string) => html.replace(/^<div>/, '').replace(/<\/div>$/, '');

/** Mirrors MessageList's MarkdownBlock: only the last (still-growing) block uses growingBlockMarkdownOptions. */
const renderPerBlock = (doc: string) => {
  const blocks = splitMarkdownBlocks(doc);
  return blocks
    .map((block, idx) =>
      render(block, idx === blocks.length - 1 ? growingBlockMarkdownOptions : markdownOptions)
    )
    .join('');
};

describe('streamed blocks render the same as the whole document', () => {
  it('wraps a lone paragraph in <p> instead of emitting a bare text node', () => {
    expect(render('Just one paragraph.')).toBe('<p>Just one paragraph.</p>');
  });

  it.each([
    ['paragraphs', 'Para one is here.\n\nPara two is here.'],
    ['paragraph then list', 'Intro line.\n\n- a\n- b'],
    ['heading then paragraph', '## A heading\n\nBody copy follows.'],
    ['paragraph then fenced code', 'Before the fence.\n\n```ts\nconst x = 1;\n```'],
  ])('agrees with the whole-document render for %s', (_label, doc) => {
    expect(renderPerBlock(doc)).toBe(unwrap(render(doc)));
  });
});
