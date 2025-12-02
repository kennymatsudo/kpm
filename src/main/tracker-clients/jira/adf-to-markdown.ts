/**
 * Convert Atlassian Document Format (ADF) to Markdown.
 *
 * ADF is a superset of Markdown - some elements (panels, media, etc.)
 * cannot be represented and are discarded. This is acceptable since
 * we just need readable descriptions, not round-trip fidelity.
 */

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
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

    case 'mediaSingle':
    case 'mediaGroup':
      // Media cannot be represented in markdown - return placeholder
      return '[Media attachment]';

    default:
      // Unsupported block types - fall back to extracting any text content
      return convertInline(node.content);
  }
}

function convertListItem(node: AdfNode): string {
  if (!node.content) return '';
  // List items can contain paragraphs or nested lists
  const parts: string[] = [];
  for (const child of node.content) {
    if (child.type === 'paragraph') {
      parts.push(convertInline(child.content));
    } else if (child.type === 'bulletList' || child.type === 'orderedList') {
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

    if (node.type === 'status') {
      const text = (node.attrs?.text as string) ?? '';
      return `[${text}]`;
    }

    // Unsupported inline types - silently skip
    return '';
  }).join('');
}
