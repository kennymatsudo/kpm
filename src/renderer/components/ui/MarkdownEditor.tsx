/**
 * MarkdownEditor - Monaco-backed markdown editor with toolbar and preview
 *
 * - Edit pane: Monaco editor (markdown language, theme-aware)
 * - Preview pane: markdown-to-jsx with custom search highlight
 * - Toolbar formatting actions toggle on/off:
 *   - wrap (bold/italic/code) — strips markers when already wrapped
 *   - prefix (H1/H2/H3, lists, quote) — strips when already applied; swaps heading levels
 *   - block (code block) — unfences when selection is already a fenced block
 * - Cmd+F: Monaco's native find in edit mode; custom overlay in preview mode
 * - Cmd+B/I/K/` shortcuts via Monaco addCommand
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Markdown } from 'markdown-to-jsx';
import MonacoEditor from '@monaco-editor/react';
import type { BeforeMount, OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { configureMonaco } from '../../lib/monaco';
import { useTheme } from '../../contexts';
import { createMonacoThemeData } from '../../themes';
import { registerPlanRefMonacoProviders } from './planRefMonaco';
import { Tooltip } from './Tooltip';

export interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, title, children }: ToolbarButtonProps) {
  return (
    <Tooltip content={title} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={title}
        className="p-1.5 rounded-md transition-colors text-text-muted hover:text-text-primary hover:bg-surface-2"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border-default mx-1" />;
}

type FormatAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'block'; before: string; after: string }
  | { type: 'link' };

const HEADING_REGEX = /^(#{1,6})\s/;
const HEADING_PREFIX_REGEX = /^#+\s$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MARKDOWN_EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 22,
  fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace)',
  padding: { top: 16, bottom: 16 },
  roundedSelection: false,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  renderLineHighlight: 'none',
  lineNumbers: 'off',
  glyphMargin: false,
  folding: false,
  wordWrap: 'on',
  wrappingIndent: 'indent',
  tabSize: 2,
  insertSpaces: true,
  // Suppress every code-editor affordance Monaco enables by default so the
  // surface reads as a prose editor — except the bits that power plan-ref
  // authoring: completion on `@` and hover for resolving `@plan/<uuid>`.
  quickSuggestions: false,
  suggestOnTriggerCharacters: true,
  parameterHints: { enabled: false },
  hover: { enabled: true, delay: 200 },
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  codeLens: false,
  matchBrackets: 'never',
  bracketPairColorization: { enabled: false },
  guides: { bracketPairs: false, indentation: false },
  renderValidationDecorations: 'off',
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
    includeComments: false,
    includeStrings: false,
  },
};

type EditorInstance = Monaco.editor.IStandaloneCodeEditor;
type MonacoNs = typeof Monaco;

function applyWrap(
  editor: EditorInstance,
  monacoNs: MonacoNs,
  before: string,
  after: string,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const selectedText = model.getValueInRange(selection);
  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());

  // Toggle off: selection already contains the markers (e.g., "**foo**" selected)
  if (
    selectedText.length >= before.length + after.length &&
    selectedText.startsWith(before) &&
    selectedText.endsWith(after)
  ) {
    const inner = selectedText.slice(before.length, selectedText.length - after.length);
    editor.executeEdits('md-toolbar', [{ range: selection, text: inner }]);
    const startPos = model.getPositionAt(startOffset);
    const endPos = model.getPositionAt(startOffset + inner.length);
    editor.setSelection(new monacoNs.Selection(
      startPos.lineNumber, startPos.column,
      endPos.lineNumber, endPos.column,
    ));
    return;
  }

  // Toggle off: selection is bare but immediately surrounded by markers
  const fullText = model.getValue();
  const precedingText = fullText.slice(Math.max(0, startOffset - before.length), startOffset);
  const followingText = fullText.slice(endOffset, Math.min(fullText.length, endOffset + after.length));

  if (
    selectedText.length > 0 &&
    precedingText === before &&
    followingText === after
  ) {
    const extStartOffset = startOffset - before.length;
    const extEndOffset = endOffset + after.length;
    const extStart = model.getPositionAt(extStartOffset);
    const extEnd = model.getPositionAt(extEndOffset);
    editor.executeEdits('md-toolbar', [{
      range: new monacoNs.Range(
        extStart.lineNumber, extStart.column,
        extEnd.lineNumber, extEnd.column,
      ),
      text: selectedText,
    }]);
    const newStart = model.getPositionAt(extStartOffset);
    const newEnd = model.getPositionAt(extStartOffset + selectedText.length);
    editor.setSelection(new monacoNs.Selection(
      newStart.lineNumber, newStart.column,
      newEnd.lineNumber, newEnd.column,
    ));
    return;
  }

  // Default: wrap the selection
  editor.executeEdits('md-toolbar', [{
    range: selection,
    text: before + selectedText + after,
  }]);
  const innerStart = model.getPositionAt(startOffset + before.length);
  const innerEnd = model.getPositionAt(startOffset + before.length + selectedText.length);
  editor.setSelection(new monacoNs.Selection(
    innerStart.lineNumber, innerStart.column,
    innerEnd.lineNumber, innerEnd.column,
  ));
}

function applyPrefix(
  editor: EditorInstance,
  monacoNs: MonacoNs,
  prefix: string,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const isHeading = HEADING_PREFIX_REGEX.test(prefix);
  const startLine = selection.startLineNumber;
  const endLine = selection.endLineNumber;
  const edits: Monaco.editor.IIdentifiedSingleEditOperation[] = [];

  for (let line = startLine; line <= endLine; line++) {
    const lineContent = model.getLineContent(line);

    if (isHeading) {
      const match = HEADING_REGEX.exec(lineContent);
      if (match) {
        const existing = match[0];
        if (existing === prefix) {
          // Toggle off the heading
          edits.push({
            range: new monacoNs.Range(line, 1, line, existing.length + 1),
            text: '',
          });
        } else {
          // Swap heading level (e.g., H1 -> H2)
          edits.push({
            range: new monacoNs.Range(line, 1, line, existing.length + 1),
            text: prefix,
          });
        }
      } else {
        edits.push({
          range: new monacoNs.Range(line, 1, line, 1),
          text: prefix,
        });
      }
    } else if (lineContent.startsWith(prefix)) {
      edits.push({
        range: new monacoNs.Range(line, 1, line, prefix.length + 1),
        text: '',
      });
    } else {
      edits.push({
        range: new monacoNs.Range(line, 1, line, 1),
        text: prefix,
      });
    }
  }

  editor.executeEdits('md-toolbar', edits);
}

function applyBlock(
  editor: EditorInstance,
  monacoNs: MonacoNs,
  before: string,
  after: string,
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const selectedText = model.getValueInRange(selection);

  // Toggle off: selection is already a fenced block
  const fenceRegex = new RegExp(
    `^\\n?${escapeRegExp(before)}\\n?([\\s\\S]*?)\\n?${escapeRegExp(after)}\\n?$`,
  );
  const fenceMatch = fenceRegex.exec(selectedText);
  if (fenceMatch) {
    editor.executeEdits('md-toolbar', [{ range: selection, text: fenceMatch[1] }]);
    return;
  }

  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const fullText = model.getValue();
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const textBefore = fullText.slice(0, startOffset);
  const textAfter = fullText.slice(endOffset);
  const needsNewlineBefore = textBefore.length > 0 && !textBefore.endsWith('\n');
  const needsNewlineAfter = textAfter.length > 0 && !textAfter.startsWith('\n');
  const leadNl = needsNewlineBefore ? '\n' : '';
  const trailNl = needsNewlineAfter ? '\n' : '';
  const codeContent = selectedText || 'code';
  const replacement = leadNl + before + '\n' + codeContent + '\n' + after + trailNl;

  editor.executeEdits('md-toolbar', [{ range: selection, text: replacement }]);

  const codeStartOffset = startOffset + leadNl.length + before.length + 1;
  const codeEndOffset = codeStartOffset + codeContent.length;
  const codeStart = model.getPositionAt(codeStartOffset);
  const codeEnd = model.getPositionAt(codeEndOffset);
  editor.setSelection(new monacoNs.Selection(
    codeStart.lineNumber, codeStart.column,
    codeEnd.lineNumber, codeEnd.column,
  ));
}

function applyLink(editor: EditorInstance, monacoNs: MonacoNs): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const selectedText = model.getValueInRange(selection);
  const startOffset = model.getOffsetAt(selection.getStartPosition());

  let replacement: string;
  let cursorOffset: number;
  let selectionLength: number;

  if (selectedText) {
    replacement = `[${selectedText}](url)`;
    cursorOffset = selectedText.length + 3; // past "[text]("
    selectionLength = 3; // 'url'
  } else {
    replacement = '[text](url)';
    cursorOffset = 1;
    selectionLength = 4; // 'text'
  }

  editor.executeEdits('md-toolbar', [{ range: selection, text: replacement }]);

  const selStart = model.getPositionAt(startOffset + cursorOffset);
  const selEnd = model.getPositionAt(startOffset + cursorOffset + selectionLength);
  editor.setSelection(new monacoNs.Selection(
    selStart.lineNumber, selStart.column,
    selEnd.lineNumber, selEnd.column,
  ));
}

function applyFormatToEditor(
  editor: EditorInstance,
  monacoNs: MonacoNs,
  action: FormatAction,
): void {
  switch (action.type) {
    case 'wrap':
      applyWrap(editor, monacoNs, action.before, action.after);
      break;
    case 'prefix':
      applyPrefix(editor, monacoNs, action.prefix);
      break;
    case 'block':
      applyBlock(editor, monacoNs, action.before, action.after);
      break;
    case 'link':
      applyLink(editor, monacoNs);
      break;
  }
}

export function MarkdownEditor({
  content,
  onChange,
}: MarkdownEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchNavigationTick, setSearchNavigationTick] = useState(0);
  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<MonacoNs | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useMemo(() => configureMonaco(), []);
  const { resolved, resolvedTheme } = useTheme();
  // Distinct theme name from CodeEditor's so we can override gutter colors
  // without affecting the standard code editor.
  const monacoThemeName = useMemo(
    () => `kpm-md-${resolved.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    [resolved],
  );

  const defineCurrentTheme = useCallback((monacoInstance: MonacoNs) => {
    const base = createMonacoThemeData(resolvedTheme) as Monaco.editor.IStandaloneThemeData;
    const editorBg = base.colors['editor.background'];
    monacoInstance.editor.defineTheme(monacoThemeName, {
      ...base,
      colors: {
        ...base.colors,
        // Blend the gutter into the editor body so the left edge has no visible seam.
        'editorGutter.background': editorBg,
      },
    });
  }, [monacoThemeName, resolvedTheme]);

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  // Sync local content when prop changes. localContent is intentionally
  // omitted from deps: typing path also updates content via onChange, so the
  // values stay aligned without re-running the effect on every keystroke.
  const latestLocalContent = useRef(localContent);
  useEffect(() => {
    latestLocalContent.current = localContent;
  });
  useEffect(() => {
    if (content !== latestLocalContent.current) {
      setLocalContent(content);
    }
  }, [content]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const newContent = value ?? '';
      setLocalContent(newContent);
      onChange(newContent);
    },
    [onChange],
  );

  // Apply formatting via Monaco; switch to edit mode first if currently in preview.
  const applyFormat = useCallback((action: FormatAction) => {
    const editor = editorRef.current;
    const monacoNs = monacoRef.current;
    if (!editor || !monacoNs) return;

    const wasInPreview = activeTab !== 'edit';
    if (wasInPreview) {
      setActiveTab('edit');
    }

    const apply = () => {
      applyFormatToEditor(editor, monacoNs, action);
      editor.focus();
    };

    if (wasInPreview) {
      requestAnimationFrame(apply);
    } else {
      apply();
    }
  }, [activeTab]);

  // Keep a stable ref so Monaco shortcut handlers always call the latest applyFormat.
  const applyFormatRef = useRef(applyFormat);
  useEffect(() => {
    applyFormatRef.current = applyFormat;
  }, [applyFormat]);

  // Toolbar callbacks
  const formatBold = useCallback(() => applyFormat({ type: 'wrap', before: '**', after: '**' }), [applyFormat]);
  const formatItalic = useCallback(() => applyFormat({ type: 'wrap', before: '_', after: '_' }), [applyFormat]);
  const formatCode = useCallback(() => applyFormat({ type: 'wrap', before: '`', after: '`' }), [applyFormat]);
  const formatCodeBlock = useCallback(() => applyFormat({ type: 'block', before: '```', after: '```' }), [applyFormat]);
  const formatH1 = useCallback(() => applyFormat({ type: 'prefix', prefix: '# ' }), [applyFormat]);
  const formatH2 = useCallback(() => applyFormat({ type: 'prefix', prefix: '## ' }), [applyFormat]);
  const formatH3 = useCallback(() => applyFormat({ type: 'prefix', prefix: '### ' }), [applyFormat]);
  const formatBulletList = useCallback(() => applyFormat({ type: 'prefix', prefix: '- ' }), [applyFormat]);
  const formatNumberedList = useCallback(() => applyFormat({ type: 'prefix', prefix: '1. ' }), [applyFormat]);
  const formatQuote = useCallback(() => applyFormat({ type: 'prefix', prefix: '> ' }), [applyFormat]);
  const formatLink = useCallback(() => applyFormat({ type: 'link' }), [applyFormat]);

  const beforeMount: BeforeMount = (monacoInstance) => {
    defineCurrentTheme(monacoInstance);
  };

  const planRefDisposerRef = useRef<{ dispose: () => void } | null>(null);

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    editor.getModel()?.updateOptions({ tabSize: 2, insertSpaces: true });
    defineCurrentTheme(monacoInstance);
    monacoInstance.editor.setTheme(monacoThemeName);
    planRefDisposerRef.current?.dispose();
    planRefDisposerRef.current = registerPlanRefMonacoProviders(editor, monacoInstance);

    // Override Monaco's built-in Cmd+B (go to definition) and bind formatting shortcuts.
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyB,
      () => applyFormatRef.current({ type: 'wrap', before: '**', after: '**' }),
    );
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyI,
      () => applyFormatRef.current({ type: 'wrap', before: '_', after: '_' }),
    );
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyK,
      () => applyFormatRef.current({ type: 'link' }),
    );
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Backquote,
      () => applyFormatRef.current({ type: 'wrap', before: '`', after: '`' }),
    );
  };

  // Update Monaco theme when our theme changes
  useEffect(() => {
    if (!monacoRef.current) return;
    defineCurrentTheme(monacoRef.current);
    monacoRef.current.editor.setTheme(monacoThemeName);
  }, [defineCurrentTheme, monacoThemeName]);

  // Dispose plan-ref Monaco providers when this editor unmounts.
  useEffect(() => {
    return () => {
      planRefDisposerRef.current?.dispose();
      planRefDisposerRef.current = null;
    };
  }, []);

  // ----- Preview-mode search -----
  const matchIndexes = useMemo(() => {
    if (!showSearch || !searchQuery) return [];

    const results: number[] = [];
    const lowerQuery = searchQuery.toLowerCase();
    let index = lowerContent.indexOf(lowerQuery);

    while (index !== -1) {
      results.push(index);
      index = lowerContent.indexOf(lowerQuery, index + 1);
    }

    return results;

  const totalMatches = matchIndexes.length;

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
    setSearchNavigationTick(0);
  }, []);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    focusSearchInput();
  }, [focusSearchInput]);

  // Toolbar search button: in edit mode trigger Monaco's native find;
  // in preview mode open our overlay.
  const handleSearchButton = useCallback(() => {
    if (activeTab === 'edit') {
      const editor = editorRef.current;
      editor?.focus();
      void editor?.getAction('actions.find')?.run();
    } else {
      openSearch();
    }
  }, [activeTab, openSearch]);

  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const nextIndex = (currentMatchIndex + 1) % totalMatches;
    setCurrentMatchIndex(nextIndex);
    setSearchNavigationTick((prev) => prev + 1);
  }, [totalMatches, currentMatchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const prevIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    setCurrentMatchIndex(prevIndex);
    setSearchNavigationTick((prev) => prev + 1);
  }, [totalMatches, currentMatchIndex]);

  const searchOptions = useMemo(() => {
    if (!showSearch || !searchQuery) return markdownOptions;
    return createSearchHighlightOptions(searchQuery, currentMatchIndex);
  }, [showSearch, searchQuery, currentMatchIndex]);

  useEffect(() => {
    if (currentMatchIndex >= totalMatches) {
      setCurrentMatchIndex(Math.max(0, totalMatches - 1));
    }
  }, [currentMatchIndex, totalMatches]);

  useEffect(() => {
    if (!showSearch) return;
    focusSearchInput();
  }, [showSearch, focusSearchInput]);

  // Cmd+F: only intercept in preview mode (Monaco handles edit mode natively).
  // Esc closes the preview overlay when open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSearch) {
        e.preventDefault();
        closeSearch();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && activeTab === 'preview') {
        e.preventDefault();
        openSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, closeSearch, openSearch, activeTab]);

  // Close the preview overlay when switching to edit mode
  // (Monaco's native find takes over there).
  useEffect(() => {
    if (activeTab === 'edit' && showSearch) {
      closeSearch();
    }
  }, [activeTab, showSearch, closeSearch]);

  // Scroll preview to the current match
  useEffect(() => {
    if (activeTab !== 'preview' || !showSearch || !searchQuery || totalMatches === 0) return;

    const timeoutId = setTimeout(() => {
      const container = previewRef.current;
      if (!container) return;
      const allMatches = Array.from(container.querySelectorAll<HTMLElement>('mark[data-search-match]'));
      const targetMatch =
        allMatches[currentMatchIndex] ??
        container.querySelector<HTMLElement>(`[data-search-match="${currentMatchIndex}"]`) ??
        container.querySelector<HTMLElement>('[data-current="true"]') ??
        allMatches[0];
      if (targetMatch) {
        targetMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [activeTab, showSearch, searchQuery, totalMatches, currentMatchIndex, searchNavigationTick]);

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {/* Toolbar with Edit/Preview toggle */}
      <div className="px-4 py-2 border-b border-border-default bg-surface-1 flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all
              ${activeTab === 'edit'
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
              }`}
          >
            Edit
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all
              ${activeTab === 'preview'
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
              }`}
          >
            Preview
          </button>
        </div>

        <ToolbarDivider />

        <div className={`flex-1 overflow-x-auto min-w-0 ${activeTab === 'preview' ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-0.5">
            <ToolbarButton onClick={formatBold} title="Bold (Cmd+B)">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </ToolbarButton>
            <ToolbarButton onClick={formatItalic} title="Italic (Cmd+I)">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="4" x2="10" y2="4" />
                <line x1="14" y1="20" x2="5" y2="20" />
                <line x1="15" y1="4" x2="9" y2="20" />
              </svg>
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatH1} title="Heading 1">
              <span className="font-bold text-xs">H1</span>
            </ToolbarButton>
            <ToolbarButton onClick={formatH2} title="Heading 2">
              <span className="font-bold text-xs">H2</span>
            </ToolbarButton>
            <ToolbarButton onClick={formatH3} title="Heading 3">
              <span className="font-bold text-xs">H3</span>
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatCode} title="Inline Code">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </ToolbarButton>
            <ToolbarButton onClick={formatCodeBlock} title="Code Block">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <polyline points="9 9 6 12 9 15" />
                <polyline points="15 9 18 12 15 15" />
              </svg>
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatBulletList} title="Bullet List">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="4" cy="6" r="1" fill="currentColor" />
                <circle cx="4" cy="12" r="1" fill="currentColor" />
                <circle cx="4" cy="18" r="1" fill="currentColor" />
              </svg>
            </ToolbarButton>
            <ToolbarButton onClick={formatNumberedList} title="Numbered List">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="10" y1="6" x2="21" y2="6" />
                <line x1="10" y1="12" x2="21" y2="12" />
                <line x1="10" y1="18" x2="21" y2="18" />
                <text x="3" y="8" fontSize="6" fill="currentColor" stroke="none">1</text>
                <text x="3" y="14" fontSize="6" fill="currentColor" stroke="none">2</text>
                <text x="3" y="20" fontSize="6" fill="currentColor" stroke="none">3</text>
              </svg>
            </ToolbarButton>
            <ToolbarButton onClick={formatQuote} title="Quote">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
              </svg>
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatLink} title="Link (Cmd+K)">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
            </ToolbarButton>
          </div>
        </div>

        <Tooltip content="Search in document (Cmd+F)" side="bottom">
          <button
            type="button"
            onClick={handleSearchButton}
            aria-label="Search in document"
            className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
              showSearch
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {showSearch && activeTab === 'preview' && (
        <div className="px-4 py-2 bg-surface-2 border-b border-border-default">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>

            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    goToPrevMatch();
                  } else {
                    goToNextMatch();
                  }
                }
              }}
              placeholder="Search in document..."
              className="flex-1 bg-surface-1 border border-border-subtle rounded-md px-3 py-1.5 text-sm
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30"
            />

            {searchQuery && (
              <span className="text-xs text-text-muted whitespace-nowrap">
                {totalMatches === 0 ? 'No matches' : `${currentMatchIndex + 1} of ${totalMatches}`}
              </span>
            )}

            <div className="flex items-center gap-0.5">
              <Tooltip content="Previous match (Shift+Enter)" side="bottom">
                <button
                  type="button"
                  onClick={goToPrevMatch}
                  disabled={totalMatches === 0}
                  className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1
                             transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous match"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip content="Next match (Enter)" side="bottom">
                <button
                  type="button"
                  onClick={goToNextMatch}
                  disabled={totalMatches === 0}
                  className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1
                             transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next match"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </Tooltip>
            </div>

            <Tooltip content="Close search (Esc)" side="bottom">
              <button
                type="button"
                onClick={closeSearch}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-1 transition-colors"
                aria-label="Close search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Keep Monaco mounted; render preview only when active so typing does not parse hidden markdown. */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 px-4 bg-surface-1 ${activeTab === 'edit' ? 'block' : 'hidden'}`}>
          <MonacoEditor
            value={localContent}
            language="markdown"
            theme={monacoThemeName}
            beforeMount={beforeMount}
            onMount={handleMount}
            onChange={handleEditorChange}
            options={MARKDOWN_EDITOR_OPTIONS}
          />
        </div>

        {activeTab === 'preview' && (
          <div className="absolute inset-0">
            <div ref={previewRef} className="h-full overflow-y-auto p-4 select-text cursor-text">
                {localContent ? (
                ) : (
                  <div className="flex items-center justify-center h-32 text-text-muted">
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">Preview will appear here...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
