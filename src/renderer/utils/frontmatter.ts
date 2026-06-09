/**
 * YAML frontmatter detection for markdown previews.
 *
 * Rendering frontmatter through markdown-to-jsx produces garbage: the opening
 * `---` becomes a thematic break and the key/value lines collapse into
 * paragraphs. Previews split it off and show it as a collapsed metadata block
 * instead. Edit mode always shows the raw file, so this is display-only.
 */

export interface FrontmatterSplit {
  /** Raw frontmatter text between the fences, or null if none detected. */
  frontmatter: string | null;
  /** Document content after the closing fence (the whole input if no frontmatter). */
  body: string;
}

/** A frontmatter block must close within this many lines to be treated as one. */
const MAX_FRONTMATTER_LINES = 50;

/** Matches a YAML mapping key at the start of a line, e.g. `title:` or `sidebar_position:`. */
const YAML_KEY_REGEX = /^[A-Za-z0-9_-]+\s*:/;

function isFence(line: string): boolean {
  return line.replace(/\r$/, '') === '---';
}

/**
 * Split leading YAML frontmatter from a markdown document.
 *
 * Detection is deliberately conservative so a document that legitimately
 * opens with a horizontal rule is not eaten: the first line must be exactly
 * `---`, a closing `---` must appear within MAX_FRONTMATTER_LINES, and at
 * least one line between the fences must look like a YAML key.
 */
export function splitFrontmatter(content: string): FrontmatterSplit {
  const noMatch: FrontmatterSplit = { frontmatter: null, body: content };
  if (!content.startsWith('---')) return noMatch;

  const lines = content.split('\n');
  if (!isFence(lines[0])) return noMatch;

  let closingIndex = -1;
  const searchLimit = Math.min(lines.length, MAX_FRONTMATTER_LINES + 1);
  for (let i = 1; i < searchLimit; i++) {
    if (isFence(lines[i])) {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) return noMatch;

  const inner = lines.slice(1, closingIndex);
  if (!inner.some((line) => YAML_KEY_REGEX.test(line))) return noMatch;

  return {
    frontmatter: inner.join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
  };
}
