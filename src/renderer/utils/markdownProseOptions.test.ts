import { describe, expect, it } from 'vitest';
import {
  createFocusMarkdownOptions,
  createSearchHighlightOptions,
  githubMarkdownOptions,
  growingBlockMarkdownOptions,
  markdownOptions,
} from './markdown';

describe('every prose-rendering markdown options object forces block rendering', () => {
  it.each([
    ['markdownOptions', markdownOptions],
    ['growingBlockMarkdownOptions', growingBlockMarkdownOptions],
    ['githubMarkdownOptions', githubMarkdownOptions],
    ['createFocusMarkdownOptions()', createFocusMarkdownOptions()],
    ['createSearchHighlightOptions()', createSearchHighlightOptions('term', 0)],
  ])('%s sets forceBlock: true', (_label, options) => {
    expect(options.forceBlock).toBe(true);
  });
});
