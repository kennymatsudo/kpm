/**
 * Detects relative file paths in chat output so inline `code` spans like
 * `src/main/foo.ts` or `bar/baz.py:42` can render as clickable file links.
 *
 * Pure module — callable from renderer and main.
 */

/**
 * A path-shaped token: at least one `/`, a final segment with an extension
 * (1–10 alphanumeric chars), and an optional `:lineNumber` suffix. URLs are
 * excluded by the negative lookahead on `http://` / `https://`. Anchored —
 * intended to test the full contents of an inline code span, not to scan
 * free text.
 */
export const PATH_REF_REGEX =
  /^(?!https?:\/\/)(?:[\w.-]+\/)+[\w-]+\.[a-zA-Z0-9]{1,10}(?::\d+)?$/;

export function isPathLike(text: string): boolean {
  return PATH_REF_REGEX.test(text);
}

/** Split a path token into its path and optional 1-based line number. */
export function parsePathRef(text: string): { path: string; line: number | null } {
  const lineMatch = /^(.+?):(\d+)$/.exec(text);
  if (lineMatch) {
    return { path: lineMatch[1], line: Number(lineMatch[2]) };
  }
  return { path: text, line: null };
}
