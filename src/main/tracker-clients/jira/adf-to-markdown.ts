/**
 * Convert Atlassian Document Format (ADF) to Markdown.
 *
 * ADF is a superset of Markdown. Anything this converter doesn't recognise
 * still yields its text, because the result is written back to Jira and
 * Confluence on push: a block dropped here is a block deleted there.
 * `findUnrepresentableContent` names what the text form cannot carry back, so
 * a push can warn before replacing it.
 */

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, string> }[];
  attrs?: Record<string, unknown>;
}

interface AdfDocument {
  version: number;
  type: 'doc';
  content: AdfNode[];
}

export function adfToMarkdown(adf: unknown): string | null {
  if (!adf || typeof adf !== 'object' || !('content' in adf)) return null;
  const doc = adf as AdfDocument;
  const result = doc.content.map(convertBlock).filter(Boolean).join('\n\n');
  return result || null;
}

function convertBlock(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return convertInline(node.content);

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      return '#'.repeat(Math.min(level, 6)) + ' ' + convertInline(node.content);
    }

    case 'bulletList':
      return (node.content ?? [])
        .map(li => '- ' + convertListItem(li))
        .join('\n');

    case 'orderedList':
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + convertListItem(li))
        .join('\n');

    case 'listItem':
      return convertListItem(node);

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? '';
      const code = convertInline(node.content);
      return '```' + lang + '\n' + code + '\n```';
    }

    case 'blockquote':
      return (node.content ?? [])
        .map(n => '> ' + convertBlock(n))
        .join('\n');

    case 'rule':
      return '---';

    case 'table':
      return convertTable(node);

    case 'panel': {
      // Panels have a type (info, warning, error, success, note)
      const panelType = (node.attrs?.panelType as string) ?? 'note';
      const content = (node.content ?? []).map(convertBlock).join('\n\n');
      return `> **${panelType.toUpperCase()}**\n>\n> ${content.split('\n').join('\n> ')}`;
    }

    case 'taskList':
      return convertTaskList(node);

    case 'decisionList':
      return (node.content ?? [])
        .map(item => '- **Decision:** ' + convertInline(item.content))
        .join('\n');

    case 'expand':
    case 'nestedExpand': {
      const title = (node.attrs?.title as string | undefined)?.trim();
      const body = convertBlocks(node.content);
      return [title ? `**${title}**` : '', body].filter(Boolean).join('\n\n');
    }

    case 'blockCard':
    case 'embedCard':
      return cardUrl(node);

    case 'mediaSingle':
    case 'mediaGroup':
      return (node.content ?? []).map(convertMedia).join('\n');

    case 'media':
      return convertMedia(node);

    default:
      // Containers this converter doesn't name (layoutSection, layoutColumn,
      // bodiedExtension, ...) hold blocks; a few leaf types hold inline text.
      if (node.content?.some(child => INLINE_NODE_TYPES.has(child.type))) {
        return convertInline(node.content);
      }
      return convertBlocks(node.content);
  }
}

const INLINE_NODE_TYPES = new Set([
  'text', 'hardBreak', 'mention', 'emoji', 'inlineCard', 'date', 'status',
  'mediaInline', 'placeholder', 'inlineExtension',
]);

function convertBlocks(content?: AdfNode[]): string {
  return (content ?? []).map(convertBlock).filter(Boolean).join('\n\n');
}

function convertTaskList(node: AdfNode): string {
  return (node.content ?? [])
    .map(item => {
      if (item.type === 'taskList') {
        return convertTaskList(item).split('\n').map(line => '  ' + line).join('\n');
      }
      const box = item.attrs?.state === 'DONE' ? '[x]' : '[ ]';
      return `- ${box} ${convertInline(item.content)}`;
    })
    .join('\n');
}

function cardUrl(node: AdfNode): string {
  const url = node.attrs?.url;
  if (typeof url === 'string') return url;
  const data = node.attrs?.data as { url?: unknown } | undefined;
  return typeof data?.url === 'string' ? data.url : '';
}

/**
 * An uploaded file has no URL outside Jira, so it stays a named placeholder
 * rather than vanishing; pushing the text back cannot restore it, which is
 * what `findUnrepresentableContent` reports.
 */
function convertMedia(node: AdfNode): string {
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
  if (node.attrs?.type === 'external' && typeof node.attrs.url === 'string') {
    return `![${alt}](${node.attrs.url})`;
  }
  return alt ? `[Media attachment: ${alt}]` : '[Media attachment]';
}

/** Node types markdown cannot carry back to ADF, labelled for a warning. */
const UNREPRESENTABLE_NODE_LABELS: Record<string, string> = {
  media: 'attachments',
  mediaInline: 'attachments',
  expand: 'expand sections',
  nestedExpand: 'expand sections',
  layoutSection: 'column layouts',
  decisionList: 'decisions',
  blockCard: 'smart links',
  embedCard: 'smart links',
  inlineCard: 'smart links',
  extension: 'macros',
  bodiedExtension: 'macros',
  inlineExtension: 'macros',
  panel: 'panels',
  mention: 'mentions',
  status: 'status lozenges',
  date: 'dates',
};

/**
 * What in this ADF document would be lost or flattened if its markdown form
 * were written back. Empty when the text round-trips.
 */
export function findUnrepresentableContent(adf: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, insideList: boolean): void => {
    if (!node || typeof node !== 'object') return;
    const { type, content } = node as Partial<AdfNode>;
    const label = typeof type === 'string' ? UNREPRESENTABLE_NODE_LABELS[type] : undefined;
    if (label) found.add(label);
    // markdown-to-adf reads only top-level list lines, so a nested list comes
    // back as plain paragraphs.
    const isList = typeof type === 'string' && LIST_NODE_TYPES.has(type);
    if (isList && insideList) found.add('nested lists');
    if (Array.isArray(content)) content.forEach((child) => visit(child, insideList || isList));
  };
  visit(adf, false);
  return [...found];
}

const LIST_NODE_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

function convertListItem(node: AdfNode): string {
  if (!node.content) return '';
  // List items can contain paragraphs or nested lists
  const parts: string[] = [];
  for (const child of node.content) {
    if (child.type === 'paragraph') {
      parts.push(convertInline(child.content));
    } else if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
      // Nested list - indent
      const nestedList = convertBlock(child);
      parts.push('\n' + nestedList.split('\n').map(line => '  ' + line).join('\n'));
    } else {
      parts.push(convertBlock(child));
    }
  }
  return parts.join('');
}

function convertTable(node: AdfNode): string {
  if (!node.content) return '';

  const rows = node.content.filter(r => r.type === 'tableRow');
  if (rows.length === 0) return '';

  const tableRows: string[][] = [];

  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      const cellContent = (cell.content ?? []).map(convertBlock).join(' ').trim();
      cells.push(cellContent);
    }
    tableRows.push(cells);
  }

  if (tableRows.length === 0) return '';

  // Build markdown table
  const columnCount = Math.max(...tableRows.map(r => r.length));
  const lines: string[] = [];

  // Header row
  const headerRow = tableRows[0] ?? [];
  lines.push('| ' + headerRow.map(c => c || ' ').join(' | ') + ' |');

  // Separator
  lines.push('| ' + Array(columnCount).fill('---').join(' | ') + ' |');

  // Data rows
  for (let i = 1; i < tableRows.length; i++) {
    const row = tableRows[i];
    const paddedRow = Array(columnCount).fill('').map((_, j) => row[j] || '');
    lines.push('| ' + paddedRow.join(' | ') + ' |');
  }

  return lines.join('\n');
}

function convertInline(content?: AdfNode[]): string {
  if (!content) return '';

  return content.map(node => {
    if (node.type === 'text') {
      let text = node.text ?? '';

      // Apply marks in order
      for (const mark of node.marks ?? []) {
        switch (mark.type) {
          case 'strong':
            text = `**${text}**`;
            break;
          case 'em':
            text = `*${text}*`;
            break;
          case 'code':
            text = `\`${text}\``;
            break;
          case 'strike':
            text = `~~${text}~~`;
            break;
          case 'link':
            text = `[${text}](${mark.attrs?.href ?? ''})`;
            break;
          case 'underline':
            // Markdown doesn't have underline, keep as-is
            break;
          case 'subsup':
            // Subscript/superscript - keep as-is
            break;
          case 'textColor':
          case 'backgroundColor':
            // Colors cannot be represented, keep text as-is
            break;
        }
      }
      return text;
    }

    if (node.type === 'hardBreak') {
      return '\n';
    }

    if (node.type === 'mention') {
      const text = (node.attrs?.text as string) ?? 'user';
      return `@${text}`;
    }

    if (node.type === 'emoji') {
      const shortName = (node.attrs?.shortName as string) ?? '';
      return shortName || '';
    }

    if (node.type === 'inlineCard') {
      return (node.attrs?.url as string) ?? '';
    }

    if (node.type === 'date') {
      const timestamp = node.attrs?.timestamp as string;
      if (timestamp) {
        try {
          return new Date(parseInt(timestamp)).toLocaleDateString();
        } catch {
          return timestamp;
        }
      }
      return '';
    }

    if (node.type === 'mediaInline') {
      return convertMedia(node);
    }

    if (node.type === 'status') {
      const text = (node.attrs?.text as string) ?? '';
      return `[${text}]`;
    }

    // Unsupported inline types - silently skip
    return '';
  }).join('');
}
