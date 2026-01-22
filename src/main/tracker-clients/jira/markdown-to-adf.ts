/**
 * Convert Markdown to Atlassian Document Format (ADF).
 *
 */

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, string> }[];
  attrs?: Record<string, unknown>;
}

interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfNode[];
}

/**
 * Convert markdown text to ADF document structure.
 * Returns null if input is empty/null.
 */
  if (!markdown?.trim()) return null;

  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line - skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      content.push(createCodeBlock(codeLines.join('\n'), lang));
      i++; // Skip closing ```
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      content.push(createHeading(text, level));
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      content.push({ type: 'rule' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      content.push(createBlockquote(quoteLines.join('\n')));
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-*+]\s/, ''));
        i++;
      }
      content.push(createBulletList(listItems));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      content.push(createOrderedList(listItems));
      continue;
    }

    // Regular paragraph
    const paragraphLines: string[] = [line];
    i++;
    // Collect continuation lines (non-empty, not special syntax)
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('>') &&
      !lines[i].startsWith('```') &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|_{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    content.push(createParagraph(paragraphLines.join('\n')));
  }

  return {
    version: 1,
    type: 'doc',
    content,
  };
}

function createParagraph(text: string): AdfNode {
  return {
    type: 'paragraph',
    content: parseInlineContent(text),
  };
}

function createHeading(text: string, level: number): AdfNode {
  return {
    type: 'heading',
    attrs: { level: Math.min(Math.max(level, 1), 6) },
    content: parseInlineContent(text),
  };
}

function createCodeBlock(code: string, language?: string): AdfNode {
  const node: AdfNode = {
    type: 'codeBlock',
    content: [{ type: 'text', text: code }],
  };
  if (language) {
    node.attrs = { language };
  }
  return node;
}

function createBlockquote(text: string): AdfNode {
  // Convert blockquote content to paragraphs
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  return {
    type: 'blockquote',
  };
}

function createBulletList(items: string[]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map(item => ({
      type: 'listItem',
      content: [createParagraph(item)],
    })),
  };
}

function createOrderedList(items: string[]): AdfNode {
  return {
    type: 'orderedList',
    content: items.map(item => ({
      type: 'listItem',
      content: [createParagraph(item)],
    })),
  };
}

/**
 * Parse inline markdown formatting (bold, italic, code, links).
 * Returns an array of ADF text nodes with appropriate marks.
 */
function parseInlineContent(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for inline code first (highest precedence)
    const codeMatch = /^`([^`]+)`/.exec(remaining);
    if (codeMatch) {
      nodes.push({
        type: 'text',
        text: codeMatch[1],
        marks: [{ type: 'code' }],
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Check for links [text](url)
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)/.exec(remaining);
    if (linkMatch) {
      nodes.push({
        type: 'text',
        text: linkMatch[1],
        marks: [{ type: 'link', attrs: { href: linkMatch[2] } }],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Check for bold **text** or __text__
    const boldMatch = /^(\*\*|__)([^*_]+)\1/.exec(remaining);
    if (boldMatch) {
      nodes.push({
        type: 'text',
        text: boldMatch[2],
        marks: [{ type: 'strong' }],
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for italic *text* or _text_ (not preceded by *)
    const italicMatch = /^(\*|_)([^*_]+)\1/.exec(remaining);
    if (italicMatch) {
      nodes.push({
        type: 'text',
        text: italicMatch[2],
        marks: [{ type: 'em' }],
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Check for strikethrough ~~text~~
    const strikeMatch = /^~~([^~]+)~~/.exec(remaining);
    if (strikeMatch) {
      nodes.push({
        type: 'text',
        text: strikeMatch[1],
        marks: [{ type: 'strike' }],
      });
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Find the next special character or end of string
    const nextSpecialIndex = remaining.slice(1).search(/[*_`[~]/);
    const plainTextEnd = nextSpecialIndex === -1 ? remaining.length : nextSpecialIndex + 1;

    if (plainTextEnd > 0) {
      const plainText = remaining.slice(0, plainTextEnd);
      // Handle line breaks within paragraphs
      if (plainText.includes('\n')) {
        const parts = plainText.split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i]) {
            nodes.push({ type: 'text', text: parts[i] });
          }
          if (i < parts.length - 1) {
            nodes.push({ type: 'hardBreak' });
          }
        }
      } else {
        nodes.push({ type: 'text', text: plainText });
      }
      remaining = remaining.slice(plainTextEnd);
    } else {
      // Single special character that didn't match a pattern
      nodes.push({ type: 'text', text: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return nodes.filter(n => n.text !== '' || n.type === 'hardBreak');
}
