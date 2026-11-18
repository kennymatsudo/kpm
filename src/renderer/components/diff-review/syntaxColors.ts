export const MAX_COLORIZE_LINES = 5000;

interface LanguageInfo {
  id: string;
  extensions?: readonly string[];
}

export function languageIdForPath(path: string, languages: readonly LanguageInfo[]): string | null {
  const lower = path.toLowerCase();
  const match = languages.find((language) => language.extensions?.some((ext) => lower.endsWith(ext.toLowerCase())));
  if (!match || match.id === 'plaintext') return null;
  return match.id;
}

/** Splits `monaco.editor.colorize` output into one HTML string per source line. */
export function splitColorizedHtml(html: string, expectedLines: number): string[] | null {
  const lines = html.split(/<br\s*\/?>/);
  return lines.length === expectedLines ? lines : null;
}
