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

export interface SideText {
  text: string[];
  index: Map<number, number>;
}

interface SourceLine {
  kind: 'add' | 'del' | 'context';
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

/** Old side is del+context lines, new side is add+context; `index` maps a line number to its position in `text`. */
export function sideTexts(hunks: readonly { lines: readonly SourceLine[] }[]): { oldSide: SideText; newSide: SideText } {
  const oldSide: SideText = { text: [], index: new Map() };
  const newSide: SideText = { text: [], index: new Map() };
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== 'add' && line.oldLine !== null) {
        oldSide.index.set(line.oldLine, oldSide.text.length);
        oldSide.text.push(line.text);
      }
      if (line.kind !== 'del' && line.newLine !== null) {
        newSide.index.set(line.newLine, newSide.text.length);
        newSide.text.push(line.text);
      }
    }
  }
  return { oldSide, newSide };
}

export function coloredHtmlForLine(
  line: SourceLine,
  oldSide: SideText,
  newSide: SideText,
  oldColors: readonly string[] | null,
  newColors: readonly string[] | null,
): string | null {
  const deleted = line.kind === 'del';
  const number = deleted ? line.oldLine : line.newLine;
  const at = number === null ? undefined : (deleted ? oldSide : newSide).index.get(number);
  return at === undefined ? null : ((deleted ? oldColors : newColors)?.[at] ?? null);
}
