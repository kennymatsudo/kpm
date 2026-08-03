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

/**
 * A markdown link target that points at a workspace file rather than the web —
 * `[Spec](docs/spec.md)`, `[Notes](./notes.md#today)`, `[Guide](guide.md)`.
 *
 * Looser than `PATH_REF_REGEX` because the author already committed to a link:
 * a single segment with an extension is enough, so root-level documents
 * qualify. Anything carrying a scheme, a leading `/`, a protocol-relative
 * `//`, or a bare `#fragment` fails the shape and stays an external link.
 */
const WORKSPACE_LINK_REGEX = /^(?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.[a-zA-Z0-9]{1,10}(?:#\S*)?$/;

export function isWorkspaceLinkHref(href: string): boolean {
  if (!WORKSPACE_LINK_REGEX.test(href)) return false;
  return !href.split('/').includes('..');
}

/** Strip the `./` prefix and `#fragment` an href may carry before resolution. */
export function workspaceLinkPath(href: string): string {
  const withoutFragment = href.split('#', 1)[0];
  return withoutFragment.startsWith('./') ? withoutFragment.slice(2) : withoutFragment;
}

/** Split a path token into its path and optional 1-based line number. */
export function parsePathRef(text: string): { path: string; line: number | null } {
  const lineMatch = /^(.+?):(\d+)$/.exec(text);
  if (lineMatch) {
    return { path: lineMatch[1], line: Number(lineMatch[2]) };
  }
  return { path: text, line: null };
}
