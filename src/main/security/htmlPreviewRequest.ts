import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Inline payloads and DevTools carry nothing off the machine and read nothing
 * from disk, so they pass. Every other non-file scheme, http(s) and ws(s)
 * included, is refused: a previewed page gets no network at all.
 */
const ALWAYS_ALLOWED_PROTOCOLS = new Set(['data:', 'blob:', 'devtools:']);

/**
 * Returns true when a request from a previewed HTML page may load: inline
 * payloads, or a file inside the folder the page was opened from. With no
 * known folder (a request from outside any preview), no file passes.
 *
 * The folder check is lexical. `rootDir` must already be a realpath, and the
 * page must have been loaded by its realpath, so the page's own relative URLs
 * share the prefix.
 */
export function isHtmlPreviewRequestAllowed(url: string, rootDir: string | undefined): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (ALWAYS_ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return true;
  }
  if (parsed.protocol !== 'file:' || rootDir === undefined) {
    return false;
  }

  try {
    const relative = path.relative(rootDir, fileURLToPath(parsed));
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}
