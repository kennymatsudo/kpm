/**
 * Canonicalize cosmetic markdown differences so semantically identical content
 * compares equal across an export → store → re-read round-trip.
 *
 * Trackers rewrite a description when they store it: Linear canonicalizes list
 * bullets to a single marker (`-`) and trims trailing whitespace. KPM keeps the
 * author's original markdown untouched, so a `*` bullet KPM never edits comes
 * back from Linear as `-`. Every comparison then reports a change that renders
 * identically — the spurious "modified in Linear" diff. Normalizing both sides
 * to the same canonical form is what lets `*`, `-`, and `+` bullets compare
 * equal, and it is also the form KPM sends (the tracker codecs call this on the
 * way out), so the tracker has nothing left to rewrite.
 *
 * Only render-identical differences are touched. Emphasis (`*word*`), thematic
 * breaks (`***`, `* * *`), and list content are preserved.
 */
export function normalizeMarkdown(markdown: string | null | undefined): string | null {
  if (markdown == null) return null;

  // 3+ of the same marker char, optionally space-separated, is a thematic break
  // (horizontal rule) — not a list. Leave it alone so `* * *` is not mistaken
  // for a bullet and mangled into `- * *`.
  const THEMATIC_BREAK = /^ {0,3}([-*_])( *\1){2,} *$/;
  // A list bullet: optional indent, then `*` or `+`, then required whitespace
  // before the content. The trailing whitespace requirement excludes emphasis
  // markers like `*word*`.
  const BULLET = /^([ \t]*)[*+]([ \t]+)/;

  const lines = markdown
    .replace(/\r\n?/g, '\n') // CRLF / lone CR → LF
    .split('\n')
    .map((line) => {
      const trimmed = line.replace(/[ \t]+$/, ''); // drop trailing whitespace
      if (THEMATIC_BREAK.test(trimmed)) return trimmed;
      return trimmed.replace(BULLET, '$1-$2');
    });

  // Trackers strip leading/trailing blank lines when they store a description.
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}
