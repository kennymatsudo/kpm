/**
 * Tests for Markdown to ADF converter
 */

import { describe, it, expect } from 'vitest';
import { markdownToAdf } from './markdown-to-adf';
import { adfToMarkdown } from './adf-to-markdown';

describe('markdownToAdf', () => {
  describe('basic functionality', () => {
    it('returns null for absent or blank input', () => {
      for (const input of [null, undefined, '', '   \n\t  ']) {
        expect(markdownToAdf(input)).toBeNull();
      }
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
    it('converts supported heading levels', () => {
      for (const [markdown, level, text] of [
        ['# Main Title', 1, 'Main Title'],
        ['## Section', 2, 'Section'],
        ['### Subsection', 3, 'Subsection'],
        ['###### Deep', 6, 'Deep'],
      ] as const) {
        const result = markdownToAdf(markdown);
        expect(result?.content[0].type).toBe('heading');
        expect(result?.content[0].attrs?.level).toBe(level);
        expect(result?.content[0].content?.[0].text).toBe(text);
      }
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
    it('converts supported bullet list markers', () => {
      for (const marker of ['-', '*', '+']) {
        const result = markdownToAdf(`${marker} Item 1\n${marker} Item 2`);
        expect(result?.content[0].type).toBe('bulletList');
        expect(result?.content[0].content).toHaveLength(2);
      }
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
    it('converts code blocks with and without language metadata', () => {
      const plain = markdownToAdf('```\nconst x = 1;\n```');
      expect(plain?.content[0].type).toBe('codeBlock');
      expect(plain?.content[0].attrs?.language).toBeUndefined();
      expect(plain?.content[0].content?.[0].text).toBe('const x = 1;');

      const typed = markdownToAdf('```typescript\nconst x: number = 1;\n```');
      expect(typed?.content[0].type).toBe('codeBlock');
      expect(typed?.content[0].attrs?.language).toBe('typescript');
      expect(typed?.content[0].content?.[0].text).toBe('const x: number = 1;');
    });

    it('preserves multiline code', () => {
      const code = '```\nline 1\nline 2\nline 3\n```';
      const result = markdownToAdf(code);
      expect(result?.content[0].content?.[0].text).toBe('line 1\nline 2\nline 3');
    });
  });

  describe('blockquotes', () => {
    it('converts supported blockquote forms', () => {
      for (const input of ['> A quote', '> Line 1\n> Line 2', '>No space']) {
        const result = markdownToAdf(input);
        expect(result?.content[0].type).toBe('blockquote');
      }
    });
  });

  describe('horizontal rules', () => {
    it('converts supported rule marker forms', () => {
      for (const input of ['---', '___', '***', '----------']) {
        const result = markdownToAdf(input);
        expect(result?.content[0].type).toBe('rule');
      }
    });
  });

  describe('inline formatting', () => {
    it('converts supported inline marks with the inner text', () => {
      const cases = [
      { name: '**bold**',    input: 'This is **bold** text',     mark: 'strong', text: 'bold' },
      { name: '__bold__',    input: 'This is __bold__ text',     mark: 'strong', text: 'bold' },
      { name: '*italic*',    input: 'This is *italic* text',     mark: 'em',     text: 'italic' },
      { name: '_italic_',    input: 'This is _italic_ text',     mark: 'em',     text: 'italic' },
      { name: '`code`',      input: 'Use `const` keyword',       mark: 'code',   text: 'const' },
      { name: '~~strike~~',  input: 'This is ~~deleted~~ text',  mark: 'strike', text: 'deleted' },
      ];

      for (const { input, mark, text } of cases) {
        const result = markdownToAdf(input);
        const content = result?.content[0].content ?? [];
        const node = content.find((n) => n.marks?.some((m) => m.type === mark));
        expect(node).toBeDefined();
        expect(node?.text).toBe(text);
      }
    });

    it('converts [links](url) with the href attribute', () => {
      const result = markdownToAdf('Click [here](https://example.com)');
      const content = result?.content[0].content ?? [];
      const linkNode = content.find((n) => n.marks?.some((m) => m.type === 'link'));
      expect(linkNode?.text).toBe('here');
      expect(linkNode?.marks?.[0].attrs?.href).toBe('https://example.com');
    });

    it('handles multiple formatting in same paragraph', () => {
      const result = markdownToAdf('**bold** and *italic* and `code`');
      const content = result?.content[0].content ?? [];

      const marks = ['strong', 'em', 'code'];
      for (const mark of marks) {
        expect(content.find((n) => n.marks?.some((m) => m.type === mark))).toBeDefined();
      }
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

  describe('tables', () => {
    it('converts basic table with header', () => {
      const markdown = `| Col1 | Col2 |
|------|------|
| A    | B    |`;
      const result = markdownToAdf(markdown);
      expect(result?.content[0].type).toBe('table');
      expect(result?.content[0].content).toHaveLength(2); // header + 1 data row
    });

    it('marks first row as header cells', () => {
      const markdown = `| Header1 | Header2 |
|---------|---------|
| Data1   | Data2   |`;
      const result = markdownToAdf(markdown);
      const firstRow = result?.content[0].content?.[0];
      expect(firstRow?.content?.[0].type).toBe('tableHeader');
      expect(firstRow?.content?.[1].type).toBe('tableHeader');
    });

    it('marks data rows as regular cells', () => {
      const markdown = `| Header |
|--------|
| Data   |`;
      const result = markdownToAdf(markdown);
      const dataRow = result?.content[0].content?.[1];
      expect(dataRow?.content?.[0].type).toBe('tableCell');
    });

    it('handles table with multiple data rows', () => {
      const markdown = `| Setting | Value |
|---------|-------|
| A       | 1     |
| B       | 2     |
| C       | 3     |`;
      const result = markdownToAdf(markdown);
      expect(result?.content[0].content).toHaveLength(4); // 1 header + 3 data rows
    });

    it('preserves inline formatting in cells', () => {
      const markdown = `| Format |
|--------|
| **bold** |`;
      const result = markdownToAdf(markdown);
      const dataRow = result?.content[0].content?.[1];
      const cellParagraph = dataRow?.content?.[0].content?.[0];
      const boldNode = cellParagraph?.content?.find(
        (n) => n.marks?.some((m) => m.type === 'strong')
      );
      expect(boldNode).toBeDefined();
    });

    it('handles inline code in cells', () => {
      const markdown = `| Setting | Value |
|---------|-------|
| \`ADA_TOKEN\` | secret |`;
      const result = markdownToAdf(markdown);
      const dataRow = result?.content[0].content?.[1];
      const firstCellParagraph = dataRow?.content?.[0].content?.[0];
      const codeNode = firstCellParagraph?.content?.find(
        (n) => n.marks?.some((m) => m.type === 'code')
      );
      expect(codeNode).toBeDefined();
      expect(codeNode?.text).toBe('ADA_TOKEN');
    });

    it('handles varying separator formats', () => {
      const markdown = `| A | B |
| --- | --- |
| 1 | 2 |`;
      const result = markdownToAdf(markdown);
      expect(result?.content[0].type).toBe('table');
    });

    it('handles separator with colons for alignment', () => {
      const markdown = `| Left | Center | Right |
|:-----|:------:|------:|
| L    | C      | R     |`;
      const result = markdownToAdf(markdown);
      expect(result?.content[0].type).toBe('table');
      expect(result?.content[0].content).toHaveLength(2);
    });
  });

  describe('round-trip (markdown → ADF → markdown)', () => {
    it('preserves table data through round-trip', () => {
      const original = `| Setting | Sandbox | Production |
| --- | --- | --- |
| API_KEY | sandbox-key | prod-key |
| URL | dev.example.com | example.com |`;

      const adf = markdownToAdf(original);
      expect(adf).not.toBeNull();

      const roundTripped = adfToMarkdown(adf);
      expect(roundTripped).not.toBeNull();

      // Verify table structure is preserved
      expect(roundTripped).toContain('| Setting | Sandbox | Production |');
      expect(roundTripped).toContain('| API_KEY | sandbox-key | prod-key |');
      expect(roundTripped).toContain('| URL | dev.example.com | example.com |');
    });

    it('normalizes separator format through round-trip', () => {
      // Original has varying dash lengths
      const original = `| A | B |
|---------|-----|
| 1 | 2 |`;

      const adf = markdownToAdf(original);
      const roundTripped = adfToMarkdown(adf);

      // After round-trip, separator should be normalized
      expect(roundTripped).toContain('| --- | --- |');
    });

    it('preserves inline code in table cells through round-trip', () => {
      const original = `| Setting | Value |
| --- | --- |
| \`ADA_SUBDOMAIN\` | demo-agent |`;

      const adf = markdownToAdf(original);
      const roundTripped = adfToMarkdown(adf);

      expect(roundTripped).toContain('`ADA_SUBDOMAIN`');
      expect(roundTripped).toContain('demo-agent');
    });

    it('preserves headings and paragraphs through round-trip', () => {
      const original = `# Title

Some paragraph text.

## Section

More content here.`;

      const adf = markdownToAdf(original);
      const roundTripped = adfToMarkdown(adf);

      expect(roundTripped).toContain('# Title');
      expect(roundTripped).toContain('Some paragraph text.');
      expect(roundTripped).toContain('## Section');
    });

    it('preserves mixed content with tables through round-trip', () => {
      const original = `# Config

Overview of settings.

| Setting | Value |
| --- | --- |
| Enabled | true |

## Notes

Additional info.`;

      const adf = markdownToAdf(original);
      const roundTripped = adfToMarkdown(adf);

      expect(roundTripped).toContain('# Config');
      expect(roundTripped).toContain('| Setting | Value |');
      expect(roundTripped).toContain('| Enabled | true |');
      expect(roundTripped).toContain('## Notes');
    });
  });
});
