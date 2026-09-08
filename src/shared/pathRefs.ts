/**
 * Detects relative file paths in chat output so inline `code` spans like
 * `src/main/foo.ts` or `bar/baz.py:42` can render as clickable file links.
 *
 * Pure module — callable from renderer and main.
 */

/**
 * A path-shaped token: at least one `/`, a final segment with an extension
 * (1–10 alphanumeric chars), and an optional `:lineNumber` suffix. Absolute
 * paths qualify — agents routinely report a finding as `/Users/me/repo/a.ts:12`.
 * URLs are excluded by the negative lookahead on `http://` / `https://`.
 * Anchored — intended to test the full contents of an inline code span, not to
 * scan free text.
 */
export const PATH_REF_REGEX =
  /^(?!https?:\/\/)\/?(?:[\w.-]+\/)+[\w-]+\.[a-zA-Z0-9]{1,10}(?::\d+)?$/;

export function isPathLike(text: string): boolean {
  return PATH_REF_REGEX.test(text);
}

/**
 * A markdown link target that points at a workspace file rather than the web —
 * `[Spec](docs/spec.md)`, `[Notes](./notes.md#today)`, `[Guide](guide.md)`,
 * `[Plan](/Users/me/repo/plan.md:1)`.
 *
 * Looser than `PATH_REF_REGEX` because the author already committed to a link:
 * a single segment with an extension is enough, so root-level documents
 * qualify. Anything carrying a scheme, a protocol-relative `//`, or a bare
 * `#fragment` fails the shape and stays an external link.
 *
 * An absolute path passing this test is only a *claim* that it names a
 * workspace file; whether it actually falls inside one is decided later by
 * `relativeToRoot` against the real roots.
 */
const WORKSPACE_LINK_REGEX =
  /^(?:\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.[a-zA-Z0-9]{1,10}(?::\d+)?(?:#\S*)?$/;

export function isWorkspaceLinkHref(href: string): boolean {
  if (!WORKSPACE_LINK_REGEX.test(href)) return false;
  return !href.split('/').includes('..');
}

/**
 * The bare file path an href names: no `./` prefix, no `#fragment`, no
 * `:lineNumber`. The line is dropped rather than honored because the workspace
 * editor always opens at the top of the file.
 */
export function workspaceLinkPath(href: string): string {
  const withoutFragment = href.split('#', 1)[0];
  const withoutLine = parsePathRef(withoutFragment).path;
  return withoutLine.startsWith('./') ? withoutLine.slice(2) : withoutLine;
}

/**
 * Re-express an absolute path as one relative to `root`, or `null` when it does
 * not live under that root.
 *
 * Agents report paths absolutely, but every workspace read is scoped to a
 * project or repo root and validated as relative, so an absolute path has to be
 * matched against a known root before it can be opened at all.
 */
export function relativeToRoot(absolutePath: string, root: string): string | null {
  const trimmedRoot = root.endsWith('/') ? root.slice(0, -1) : root;
  if (!absolutePath.startsWith(`${trimmedRoot}/`)) return null;
  return absolutePath.slice(trimmedRoot.length + 1);
}

/** Whether a path names a filesystem location rather than a workspace-relative one. */
export function isAbsolutePathRef(path: string): boolean {
  return path.startsWith('/');
}

/** Split a path token into its path and optional 1-based line number. */
export function parsePathRef(text: string): { path: string; line: number | null } {
  const lineMatch = /^(.+?):(\d+)$/.exec(text);
  if (lineMatch) {
    return { path: lineMatch[1], line: Number(lineMatch[2]) };
  }
  return { path: text, line: null };
}
