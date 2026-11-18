import { useEffect, useState } from 'react';
import { useTheme } from '../../contexts';
import { configureMonaco } from '../../lib/monaco';
import { createMonacoThemeData } from '../../themes';
import { MAX_COLORIZE_LINES, languageIdForPath, splitColorizedHtml } from './syntaxColors';

interface Colored {
  lines: string[];
  html: string[];
}

/**
 * Per-line highlighted HTML for `lines`, or null until ready, when the file is
 * too long, or when no language matches. Callers show plain text meanwhile.
 */
export function useSyntaxColors(path: string, lines: string[]): string[] | null {
  const { resolved, resolvedTheme } = useTheme();
  const [colored, setColored] = useState<Colored | null>(null);

  useEffect(() => {
    if (lines.length === 0 || lines.length > MAX_COLORIZE_LINES) return;
    let stale = false;
    const monaco = configureMonaco();
    const languageId = languageIdForPath(path, monaco.languages.getLanguages());
    if (!languageId) return;
    const themeName = `kpm-diff-${resolved.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    monaco.editor.defineTheme(themeName, createMonacoThemeData(resolvedTheme));
    monaco.editor.setTheme(themeName);
    monaco.editor
      .colorize(lines.join('\n'), languageId, { tabSize: 2 })
      .then((html) => {
        if (stale) return;
        const split = splitColorizedHtml(html, lines.length);
        if (split) setColored({ lines, html: split });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [path, lines, resolved, resolvedTheme]);

  // Results for a previous file or text are ignored, so plain text shows first.
  return colored?.lines === lines ? colored.html : null;
}
