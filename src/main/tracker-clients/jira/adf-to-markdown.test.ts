/**
 * Tests for ADF to Markdown converter
 */

import { describe, it, expect } from 'vitest';
import { adfToMarkdown } from './adf-to-markdown';

describe('adfToMarkdown', () => {
  describe('basic functionality', () => {
    it('returns null for absent, invalid, or empty documents', () => {
      for (const input of [
        null,
        undefined,
        'string',
        123,
        { type: 'doc' },
        { version: 1, type: 'doc', content: [] },
      ]) {
        expect(adfToMarkdown(input)).toBeNull();
      }
    });
  });

  describe('paragraphs', () => {
    it('converts a simple paragraph', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Hello world');
    });

    it('converts multiple paragraphs with double newlines', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph' }],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('First paragraph\n\nSecond paragraph');
    });
  });

  describe('text formatting', () => {
    it('converts supported marks to markdown', () => {
      const cases = [
      { mark: 'strong', leadIn: 'This is ', text: 'bold',    trailing: ' text', expected: 'This is **bold** text' },
      { mark: 'em',     leadIn: 'This is ', text: 'italic',  trailing: ' text', expected: 'This is *italic* text' },
      { mark: 'code',   leadIn: 'Use ',     text: 'const',   trailing: ' keyword', expected: 'Use `const` keyword' },
      { mark: 'strike', leadIn: 'This is ', text: 'deleted', trailing: '',      expected: 'This is ~~deleted~~' },
      ];

      for (const { mark, leadIn, text, trailing, expected } of cases) {
        const content = [
          { type: 'text', text: leadIn },
          { type: 'text', text, marks: [{ type: mark }] },
        ];
        if (trailing) content.push({ type: 'text', text: trailing });
        const adf = {
          version: 1,
          type: 'doc',
          content: [{ type: 'paragraph', content }],
        };
        expect(adfToMarkdown(adf)).toBe(expected);
      }
    });

    it('converts links', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Click ' },
              {
                type: 'text',
                text: 'here',
                marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Click [here](https://example.com)');
    });

    it('ignores unsupported marks (underline, colors)', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'colored text',
                marks: [{ type: 'textColor', attrs: { color: '#ff0000' } }],
              },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('colored text');
    });
  });

  describe('headings', () => {
    it('converts explicit heading levels', () => {
      for (const [level, text, expected] of [
        [1, 'Main Title', '# Main Title'],
        [3, 'Subsection', '### Subsection'],
      ] as const) {
        const adf = {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level },
              content: [{ type: 'text', text }],
            },
          ],
        };
        expect(adfToMarkdown(adf)).toBe(expected);
      }
    });

    it('caps heading level at 6', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 10 },
            content: [{ type: 'text', text: 'Deep heading' }],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('###### Deep heading');
    });

    it('defaults to level 1 if no level specified', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            content: [{ type: 'text', text: 'No level' }],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('# No level');
    });
  });

  describe('lists', () => {
    it('converts bullet list', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] },
                ],
              },
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] },
                ],
              },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('- Item 1\n- Item 2');
    });

    it('converts ordered list', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
                ],
              },
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
                ],
              },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('1. First\n2. Second');
    });

    it('converts nested lists with indentation', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          { type: 'paragraph', content: [{ type: 'text', text: 'Child' }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = adfToMarkdown(adf);
      expect(result).toContain('- Parent');
      expect(result).toContain('  - Child');
    });
  });

  describe('code blocks', () => {
    it('converts code blocks with and without language metadata', () => {
      const plain = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: 'const x = 1;' }],
          },
        ],
      };
      expect(adfToMarkdown(plain)).toBe('```\nconst x = 1;\n```');

      const typed = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const x: number = 1;' }],
          },
        ],
      };
      expect(adfToMarkdown(typed)).toBe('```typescript\nconst x: number = 1;\n```');
    });
  });

  describe('blockquotes', () => {
    it('converts blockquote', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'A wise quote' }],
              },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('> A wise quote');
    });
  });

  describe('horizontal rule', () => {
    it('converts rule to ---', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
          { type: 'rule' },
          { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Before\n\n---\n\nAfter');
    });
  });

  describe('tables', () => {
    it('converts simple table', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Header 1' }] },
                    ],
                  },
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Header 2' }] },
                    ],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = adfToMarkdown(adf);
      expect(result).toContain('| Header 1 | Header 2 |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| Cell 1 | Cell 2 |');
    });
  });

  describe('panels', () => {
    it('converts info panel to blockquote with label', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'panel',
            attrs: { panelType: 'info' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Important info' }],
              },
            ],
          },
        ],
      };
      const result = adfToMarkdown(adf);
      expect(result).toContain('**INFO**');
      expect(result).toContain('Important info');
    });
  });

  describe('inline elements', () => {
    it('converts mentions', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Assigned to ' },
              { type: 'mention', attrs: { text: 'john.doe' } },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Assigned to @john.doe');
    });

    it('converts emojis', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Great job ' },
              { type: 'emoji', attrs: { shortName: ':thumbsup:' } },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Great job :thumbsup:');
    });

    it('converts hard breaks', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line 2' },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Line 1\nLine 2');
    });

    it('converts inline cards (URLs)', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'See ' },
              { type: 'inlineCard', attrs: { url: 'https://jira.example.com/browse/PROJ-123' } },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('See https://jira.example.com/browse/PROJ-123');
    });

    it('converts status badges', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Status: ' },
              { type: 'status', attrs: { text: 'In Progress' } },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('Status: [In Progress]');
    });
  });

  describe('media', () => {
    it('returns placeholder for media', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'mediaSingle',
            content: [
              { type: 'media', attrs: { id: 'abc123', type: 'file' } },
            ],
          },
        ],
      };
      expect(adfToMarkdown(adf)).toBe('[Media attachment]');
    });
  });

  describe('complex documents', () => {
    it('handles a realistic Jira issue description', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Overview' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'This feature adds ' },
              { type: 'text', text: 'dark mode', marks: [{ type: 'strong' }] },
              { type: 'text', text: ' support to the application.' },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Requirements' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Toggle switch in settings' }] },
                ],
              },
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Persist user preference' }] },
                ],
              },
            ],
          },
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const theme = useTheme();' }],
          },
        ],
      };

      const result = adfToMarkdown(adf);
      expect(result).toContain('## Overview');
      expect(result).toContain('**dark mode**');
      expect(result).toContain('### Requirements');
      expect(result).toContain('- Toggle switch in settings');
      expect(result).toContain('- Persist user preference');
      expect(result).toContain('```typescript');
    });
  });
});
