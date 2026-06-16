/**
 * Pure markdown heading extraction for the Focus Mode outline / scroll-spy.
 *
 * Kept free of React imports so it can be unit-tested in isolation and reused
 * by both the outline (extractHeadings) and the rendered DOM ids
 * (createFocusMarkdownOptions in markdown.tsx) — the two MUST agree on slugs.
 */

/** A heading lifted out of a markdown document. `id` is a GitHub-style slug. */
export interface DocHeading {
  level: number;
  text: string;
  id: string;
}

/** GitHub-style slug from heading text. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation/emphasis markers
    .replace(/\s+/g, '-') // spaces → hyphens
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-+|-+$/g, ''); // trim
}

/** Strip common inline markdown from heading text (links, emphasis, code).
 * Underscores are left intact — they're word chars in snake_case identifiers,
 * which appear in headings far more often than underscore-emphasis. */
export function headingPlainText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label
    .replace(/[`*~]/g, '') // emphasis / inline-code markers
    .trim();
}

const ATX_HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*\s*$/;
const FENCE_RE = /^\s*(```+|~~~+)/;

/**
 * Parse ATX headings (`#`…`######`) out of a markdown source, skipping fenced
 * code blocks. Duplicate slugs get a `-1`, `-2`, … suffix in document order —
 * the same dedup the rendered heading-id overrides apply.
 */
export function extractHeadings(markdown: string): DocHeading[] {
  if (!markdown) return [];
  const headings: DocHeading[] = [];
  const seen = new Map<string, number>();
  let fenceMarker = '';
  for (const line of markdown.split('\n')) {
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      if (!fenceMarker) fenceMarker = marker;
      else if (marker === fenceMarker) fenceMarker = '';
      continue;
    }
    if (fenceMarker) continue;
    const m = ATX_HEADING_RE.exec(line);
    if (!m) continue;
    const text = headingPlainText(m[2]);
    if (!text) continue;
    const base = slugify(text) || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headings.push({ level: m[1].length, text, id: count === 0 ? base : `${base}-${count}` });
  }
  return headings;
}
