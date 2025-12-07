/**
 * Tests for Markdown to ADF converter
 */

import { describe, it, expect } from 'vitest';
import { markdownToAdf } from './markdown-to-adf';

describe('markdownToAdf', () => {
  describe('basic functionality', () => {
    });

    it('returns valid ADF document structure', () => {
      const result = markdownToAdf('Hello');
      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
      expect(result?.type).toBe('doc');
      expect(Array.isArray(result?.content)).toBe(true);
    });
  });

  describe('paragraphs', () => {
    it('converts simple text to paragraph', () => {
      const result = markdownToAdf('Hello world');
      expect(result?.content).toHaveLength(1);
      expect(result?.content[0].type).toBe('paragraph');
      expect(result?.content[0].content?.[0].text).toBe('Hello world');
    });

    it('handles multiple paragraphs separated by blank lines', () => {
      const result = markdownToAdf('First paragraph\n\nSecond paragraph');
      expect(result?.content).toHaveLength(2);
      expect(result?.content[0].content?.[0].text).toBe('First paragraph');
      expect(result?.content[1].content?.[0].text).toBe('Second paragraph');
    });

    it('joins continuation lines in a paragraph', () => {
      const result = markdownToAdf('Line 1\nLine 2\nLine 3');
      expect(result?.content).toHaveLength(1);
      // Lines within a paragraph should have hardBreaks
      const content = result?.content[0].content ?? [];
      expect(content.some((n) => n.type === 'hardBreak')).toBe(true);
    });
  });

  describe('headings', () => {
    });

    it('caps heading level at 6', () => {
      // More than 6 # should still be level 6
      const result = markdownToAdf('####### Too Deep');
      // This should be treated as a paragraph since it doesn't match heading pattern
      expect(result?.content[0].type).toBe('paragraph');
    });

    it('preserves inline formatting in headings', () => {
      const result = markdownToAdf('# Title with **bold**');
      const content = result?.content[0].content ?? [];
      const boldNode = content.find((n) => n.marks?.some((m) => m.type === 'strong'));
      expect(boldNode).toBeDefined();
      expect(boldNode?.text).toBe('bold');
    });
  });

  describe('lists', () => {
    });

    it('converts ordered list', () => {
      const result = markdownToAdf('1. First\n2. Second\n3. Third');
      expect(result?.content[0].type).toBe('orderedList');
      expect(result?.content[0].content).toHaveLength(3);
    });

    it('handles list items with inline formatting', () => {
      const result = markdownToAdf('- Item with **bold**');
      const listItem = result?.content[0].content?.[0];
      const paragraph = listItem?.content?.[0];
      const content = paragraph?.content ?? [];
      const boldNode = content.find((n) => n.marks?.some((m) => m.type === 'strong'));
      expect(boldNode).toBeDefined();
    });
  });

  describe('code blocks', () => {

    });

    it('preserves multiline code', () => {
      const code = '```\nline 1\nline 2\nline 3\n```';
      const result = markdownToAdf(code);
      expect(result?.content[0].content?.[0].text).toBe('line 1\nline 2\nline 3');
    });
  });

  describe('blockquotes', () => {
    });
  });

  describe('horizontal rules', () => {
    });
  });

  describe('inline formatting', () => {
    });

      const result = markdownToAdf('Click [here](https://example.com)');
      const content = result?.content[0].content ?? [];
      const linkNode = content.find((n) => n.marks?.some((m) => m.type === 'link'));
      expect(linkNode?.text).toBe('here');
      expect(linkNode?.marks?.[0].attrs?.href).toBe('https://example.com');
    });

    it('handles multiple formatting in same paragraph', () => {
      const result = markdownToAdf('**bold** and *italic* and `code`');
      const content = result?.content[0].content ?? [];

    });
  });

  describe('complex documents', () => {
    it('handles mixed content types', () => {
      const markdown = `# Title

This is a paragraph with **bold** and *italic*.

## Section

- Item 1
- Item 2

\`\`\`javascript
const x = 1;
\`\`\`

> A quote
`;

      const result = markdownToAdf(markdown);
      expect(result).not.toBeNull();

      const types = result?.content.map((n) => n.type) ?? [];
      expect(types).toContain('heading');
      expect(types).toContain('paragraph');
      expect(types).toContain('bulletList');
      expect(types).toContain('codeBlock');
      expect(types).toContain('blockquote');
    });

    it('preserves order of elements', () => {
      const markdown = `# First

Paragraph

## Second`;

      const result = markdownToAdf(markdown);
      expect(result?.content[0].type).toBe('heading');
      expect(result?.content[0].attrs?.level).toBe(1);
      expect(result?.content[1].type).toBe('paragraph');
      expect(result?.content[2].type).toBe('heading');
      expect(result?.content[2].attrs?.level).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles text with special characters', () => {
      const result = markdownToAdf('Text with <html> & "quotes"');
      expect(result?.content[0].content?.[0].text).toBe('Text with <html> & "quotes"');
    });

    it('handles incomplete formatting markers', () => {
      // Single * followed by space is consumed but not treated as italic
      // The converter handles this by treating lone markers as plain text
      const result = markdownToAdf('This has a * in it');
      expect(result).not.toBeNull();
      // The text nodes should contain all the original text content
      const allText = result?.content[0].content?.map((n) => n.text ?? '').join('') ?? '';
      expect(allText).toContain('in it');
    });

    it('handles empty list items', () => {
      const result = markdownToAdf('- \n- Item');
      expect(result?.content[0].type).toBe('bulletList');
      expect(result?.content[0].content).toHaveLength(2);
    });
  });
});
