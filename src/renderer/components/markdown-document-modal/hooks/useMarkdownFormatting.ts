import { useCallback, useEffect, type RefObject } from 'react';

type ViewMode = 'diff' | 'preview' | 'edit';

type FormatAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'block'; before: string; after: string }
  | { type: 'link' };

interface MarkdownFormattingDeps {
  draft: string;
  setDraft: (draft: string) => void;
  viewMode: ViewMode;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

interface MarkdownFormattingResult {
  applyFormat: (action: FormatAction) => void;
  formatBold: () => void;
  formatItalic: () => void;
  formatStrikethrough: () => void;
  formatCode: () => void;
  formatCodeBlock: () => void;
  formatH1: () => void;
  formatH2: () => void;
  formatH3: () => void;
  formatBulletList: () => void;
  formatNumberedList: () => void;
  formatTaskList: () => void;
  formatQuote: () => void;
  formatLink: () => void;
  formatHorizontalRule: () => void;
}

export function useMarkdownFormatting({
  draft,
  setDraft,
  viewMode,
  textareaRef,
}: MarkdownFormattingDeps): MarkdownFormattingResult {
  // Focus textarea when entering edit mode
  useEffect(() => {
    if (viewMode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [viewMode, textareaRef]);

  // Apply formatting to selected text or at cursor
  const applyFormat = useCallback((action: FormatAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = draft.substring(start, end);
    const beforeText = draft.substring(0, start);
    const afterText = draft.substring(end);

    let newText: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    switch (action.type) {
      case 'wrap': {
        newText = beforeText + action.before + selectedText + action.after + afterText;
        newCursorStart = start + action.before.length;
        newCursorEnd = end + action.before.length;
        break;
      }
      case 'prefix': {
        if (selectedText.includes('\n')) {
          const prefixedLines = selectedText
            .split('\n')
            .map(line => action.prefix + line)
            .join('\n');
          newText = beforeText + prefixedLines + afterText;
          newCursorStart = start;
          newCursorEnd = start + prefixedLines.length;
        } else {
          const lineStart = beforeText.lastIndexOf('\n') + 1;
          const linePrefix = beforeText.substring(lineStart);
          newText =
            beforeText.substring(0, lineStart) +
            action.prefix +
            linePrefix +
            selectedText +
            afterText;
          newCursorStart = start + action.prefix.length;
          newCursorEnd = end + action.prefix.length;
        }
        break;
      }
      case 'block': {
        const needsNewlineBefore = beforeText.length > 0 && !beforeText.endsWith('\n');
        const needsNewlineAfter = afterText.length > 0 && !afterText.startsWith('\n');
        const prefix = needsNewlineBefore ? '\n' : '';
        const suffix = needsNewlineAfter ? '\n' : '';
        newText =
          beforeText +
          prefix +
          action.before +
          '\n' +
          (selectedText || 'code') +
          '\n' +
          action.after +
          suffix +
          afterText;
        newCursorStart = start + prefix.length + action.before.length + 1;
        newCursorEnd = newCursorStart + (selectedText || 'code').length;
        break;
      }
      case 'link': {
        if (selectedText) {
          newText = beforeText + '[' + selectedText + '](url)' + afterText;
          newCursorStart = end + 3;
          newCursorEnd = end + 6;
        } else {
          newText = beforeText + '[text](url)' + afterText;
          newCursorStart = start + 1;
          newCursorEnd = start + 5;
        }
        break;
      }
    }

    setDraft(newText);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    });
  }, [draft, textareaRef, setDraft]);

  const formatBold = useCallback(
    () => applyFormat({ type: 'wrap', before: '**', after: '**' }),
    [applyFormat]
  );
  const formatItalic = useCallback(
    () => applyFormat({ type: 'wrap', before: '_', after: '_' }),
    [applyFormat]
  );
  const formatStrikethrough = useCallback(
    () => applyFormat({ type: 'wrap', before: '~~', after: '~~' }),
    [applyFormat]
  );
  const formatCode = useCallback(
    () => applyFormat({ type: 'wrap', before: '`', after: '`' }),
    [applyFormat]
  );
  const formatCodeBlock = useCallback(
    () => applyFormat({ type: 'block', before: '```', after: '```' }),
    [applyFormat]
  );
  const formatH1 = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '# ' }),
    [applyFormat]
  );
  const formatH2 = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '## ' }),
    [applyFormat]
  );
  const formatH3 = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '### ' }),
    [applyFormat]
  );
  const formatBulletList = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '- ' }),
    [applyFormat]
  );
  const formatNumberedList = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '1. ' }),
    [applyFormat]
  );
  const formatTaskList = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '- [ ] ' }),
    [applyFormat]
  );
  const formatQuote = useCallback(
    () => applyFormat({ type: 'prefix', prefix: '> ' }),
    [applyFormat]
  );
  const formatLink = useCallback(
    () => applyFormat({ type: 'link' }),
    [applyFormat]
  );
  const formatHorizontalRule = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const beforeText = draft.substring(0, start);
    const afterText = draft.substring(start);
    const needsNewline = beforeText.length > 0 && !beforeText.endsWith('\n');
    const newText = beforeText + (needsNewline ? '\n' : '') + '---\n' + afterText;
    setDraft(newText);
  }, [draft, textareaRef, setDraft]);

  return {
    applyFormat,
    formatBold,
    formatItalic,
    formatStrikethrough,
    formatCode,
    formatCodeBlock,
    formatH1,
    formatH2,
    formatH3,
    formatBulletList,
    formatNumberedList,
    formatTaskList,
    formatQuote,
    formatLink,
    formatHorizontalRule,
  };
}
