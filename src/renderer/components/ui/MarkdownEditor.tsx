/**
 * MarkdownEditor - the app's one markdown editing surface.
 *
 * The workspace file panel and the document modal both mount this. They differ
 * only in what they hang off the toolbar (`leading` / `actions`) and in how they
 * persist: the panel autosaves through `onChange`, the modal buffers a draft and
 * saves on demand. Everything a reader or writer touches — the reading column,
 * the formatting engine, search, the keyboard map — lives here, so the two
 * surfaces cannot drift into two different editors again.
 *
 * - Reading tab: markdown-to-jsx in the `.prose-document` register.
 * - Editing tab: Monaco in markdown mode, with `@plan/<uuid>` completion + hover.
 * - Diff tab: present only for a proposed document; the host renders the body.
 * - Formatting toggles: wrap (bold/italic/strike/code), prefix (headings, lists,
 *   quote), block (fence), and link. Each strips its own markers when reapplied.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { Markdown } from 'markdown-to-jsx';
import MonacoEditor from '@monaco-editor/react';
import type { BeforeMount, OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { configureMonaco } from '../../lib/monaco';
import { useTheme } from '../../contexts';
import { createMonacoThemeData } from '../../themes';
import { addSoftBreaks, createSearchHighlightOptions, markdownOptions, transformPlanRefs } from '../../utils/markdown';
import { splitFrontmatter } from '../../utils/frontmatter';
import { scrollBehavior } from '../../utils/reducedMotion';
import { CloseIcon, FileTextIcon, SearchIcon } from '../icons';
import { FrontmatterBlock } from './FrontmatterBlock';
import { registerPlanRefMonacoProviders } from './planRefMonaco';
import { Tooltip } from './Tooltip';

export type MarkdownView = 'diff' | 'preview' | 'edit';

export interface MarkdownEditorDiff {
  added: number;
  removed: number;
  render: () => ReactNode;
}

export interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  /** Leading toolbar content, e.g. the panel's file name and save state. */
  leading?: ReactNode;
  /** Trailing toolbar content, e.g. the panel's close and focus-reader buttons. */
  actions?: ReactNode;
  /** Adds a read-only Diff tab, opened first, for a proposed document. */
  diff?: MarkdownEditorDiff;
  /** Opens on the editing tab rather than the reading one. */
  startInEdit?: boolean;
  /** Reports the active tab so the host can match its own controls to it. */
  onViewChange?: (view: MarkdownView) => void;
  /** Escape with nothing of the editor's own open — the host decides what closes. */
  onEscape?: () => void;
  /** Keeps the reading position across tab switches and reopens, keyed per document. */
  scrollKey?: string;
}

/**
 * Reading offsets keyed by `scrollKey`, so switching to the editing tab and back
 * returns you to the paragraph you were on. Session-only by design.
 */
const readingScrollMemory = new Map<string, number>();

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: ReactNode;
}

function ToolbarButton({ onClick, title, children }: ToolbarButtonProps) {
  return (
    <Tooltip content={title} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={title}
        className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted
                   hover:text-text-primary hover:bg-surface-3 active:bg-surface-4 transition-colors"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-border-default mx-1 shrink-0" />;
}

const iconProps = {
  className: 'w-4 h-4',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
} as const;

const BoldIcon = () => (
  <svg {...iconProps}>
    <path d="M6 4h8a4 4 0 010 8H6V4zm0 8h9a4 4 0 010 8H6v-8z" />
  </svg>
);

const ItalicIcon = () => (
  <svg {...iconProps}>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);

const StrikethroughIcon = () => (
  <svg {...iconProps}>
    <path d="M17.5 12h-11M6 16.5c0 1.5 1.5 3 4.5 3 4 0 5-2 5-3.5 0-2-1.5-3-5-3" />
    <path d="M8.5 8.5c0-1.5 1.5-3 4-3 3.5 0 4.5 1.5 4.5 3 0 1-.5 1.5-1 2" />
  </svg>
);

const HeadingLabel = ({ level }: { level: 1 | 2 | 3 }) => (
  <span className="text-xs font-semibold" aria-hidden="true">H{level}</span>
);

const CodeIcon = () => (
  <svg {...iconProps}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const CodeBlockIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <polyline points="9 9 6 12 9 15" />
    <polyline points="15 9 18 12 15 15" />
  </svg>
);

const BulletListIcon = () => (
  <svg {...iconProps}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" fill="currentColor" />
    <circle cx="4" cy="12" r="1" fill="currentColor" />
    <circle cx="4" cy="18" r="1" fill="currentColor" />
  </svg>
);

const NumberedListIcon = () => (
  <svg {...iconProps}>
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <text x="2.5" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
    <text x="2.5" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
    <text x="2.5" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
  </svg>
);

const TaskListIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="4" height="4" rx="0.5" />
    <line x1="10" y1="7" x2="21" y2="7" />
    <rect x="3" y="15" width="4" height="4" rx="0.5" />
    <line x1="10" y1="17" x2="21" y2="17" />
    <path d="M4 16.5l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const QuoteIcon = () => (
  <svg {...iconProps}>
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
  </svg>
);

const HorizontalRuleIcon = () => (
  <svg {...iconProps}>
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

const LinkIcon = () => (
  <svg {...iconProps}>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const ChevronUpIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const ChevronDownIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

type FormatAction =
  | { type: 'wrap'; before: string; after: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'block'; before: string; after: string }
  | { type: 'link' };

const HEADING_REGEX = /^(#{1,6})\s/;
const HEADING_PREFIX_REGEX = /^#+\s$/;
/** Bullet, numbered, and task markers are one family: applying one replaces another. */
const LIST_MARKER_REGEX = /^(\s*)((?:[-*+] \[[ xX]\] )|(?:[-*+] )|(?:\d+\. ))/;
const LIST_PREFIX_REGEX = /^(?:[-*+] \[[ xX]\] |[-*+] |\d+\. )$/;

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
  hover: { enabled: 'on', delay: 200 },
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
  const isListMarker = LIST_PREFIX_REGEX.test(prefix);
  const startLine = selection.startLineNumber;
  const endLine = selection.endLineNumber;
  const edits: Monaco.editor.IIdentifiedSingleEditOperation[] = [];

  for (let line = startLine; line <= endLine; line++) {
    const lineContent = model.getLineContent(line);

    if (isHeading) {
      const match = HEADING_REGEX.exec(lineContent);
      if (match) {
        const existing = match[0];
        edits.push({
          range: new monacoNs.Range(line, 1, line, existing.length + 1),
          // Same level toggles the heading off; a different one swaps it.
          text: existing === prefix ? '' : prefix,
        });
      } else {
        edits.push({
          range: new monacoNs.Range(line, 1, line, 1),
          text: prefix,
        });
      }
    } else if (isListMarker) {
      const match = LIST_MARKER_REGEX.exec(lineContent);
      const indent = match ? match[1] : '';
      const existing = match ? match[2] : '';
      const markerEnd = indent.length + existing.length + 1;
      edits.push({
        range: new monacoNs.Range(line, indent.length + 1, line, markerEnd),
        // Reapplying the same marker clears it; any other marker is replaced.
        text: existing === prefix ? '' : prefix,
      });
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
  leading,
  actions,
  diff,
  startInEdit = false,
  onViewChange,
  onEscape,
  scrollKey,
}: MarkdownEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [view, setView] = useState<MarkdownView>(
    diff ? 'diff' : startInEdit ? 'edit' : 'preview',
  );
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchNavigationTick, setSearchNavigationTick] = useState(0);
  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<MonacoNs | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
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

  const changeView = useCallback((next: MarkdownView) => {
    setView(next);
    onViewChange?.(next);
  }, [onViewChange]);

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

  // Apply formatting via Monaco; switch to the editing tab first when reading.
  const applyFormat = useCallback((action: FormatAction) => {
    const editor = editorRef.current;
    const monacoNs = monacoRef.current;
    if (!editor || !monacoNs) return;

    const wasReading = view !== 'edit';
    if (wasReading) {
      changeView('edit');
    }

    const apply = () => {
      applyFormatToEditor(editor, monacoNs, action);
      editor.focus();
    };

    if (wasReading) {
      requestAnimationFrame(apply);
    } else {
      apply();
    }
  }, [view, changeView]);

  // Keep a stable ref so Monaco shortcut handlers always call the latest applyFormat.
  const applyFormatRef = useRef(applyFormat);
  useEffect(() => {
    applyFormatRef.current = applyFormat;
  }, [applyFormat]);

  // Toolbar callbacks
  const formatBold = useCallback(() => applyFormat({ type: 'wrap', before: '**', after: '**' }), [applyFormat]);
  const formatItalic = useCallback(() => applyFormat({ type: 'wrap', before: '_', after: '_' }), [applyFormat]);
  const formatStrikethrough = useCallback(() => applyFormat({ type: 'wrap', before: '~~', after: '~~' }), [applyFormat]);
  const formatCode = useCallback(() => applyFormat({ type: 'wrap', before: '`', after: '`' }), [applyFormat]);
  const formatCodeBlock = useCallback(() => applyFormat({ type: 'block', before: '```', after: '```' }), [applyFormat]);
  const formatH1 = useCallback(() => applyFormat({ type: 'prefix', prefix: '# ' }), [applyFormat]);
  const formatH2 = useCallback(() => applyFormat({ type: 'prefix', prefix: '## ' }), [applyFormat]);
  const formatH3 = useCallback(() => applyFormat({ type: 'prefix', prefix: '### ' }), [applyFormat]);
  const formatBulletList = useCallback(() => applyFormat({ type: 'prefix', prefix: '- ' }), [applyFormat]);
  const formatNumberedList = useCallback(() => applyFormat({ type: 'prefix', prefix: '1. ' }), [applyFormat]);
  const formatTaskList = useCallback(() => applyFormat({ type: 'prefix', prefix: '- [ ] ' }), [applyFormat]);
  const formatQuote = useCallback(() => applyFormat({ type: 'prefix', prefix: '> ' }), [applyFormat]);
  const formatHorizontalRule = useCallback(() => applyFormat({ type: 'block', before: '---', after: '---' }), [applyFormat]);
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

  // Frontmatter is split off when reading and shown as a collapsed metadata
  // block; the editing tab keeps showing the raw file.
  const { frontmatter, body } = useMemo(() => splitFrontmatter(localContent), [localContent]);

  // ----- Reading position -----
  // The reading pane unmounts whenever you switch to the editing tab, so the
  // offset is restored in the ref callback: an effect would run before the node
  // exists. The browser clamps to scrollHeight, so a stale offset from a file
  // that has since shrunk degrades to "scroll to bottom" rather than throwing.
  const readingScrollTopRef = useRef(scrollKey ? readingScrollMemory.get(scrollKey) ?? 0 : 0);

  const attachPreviewNode = useCallback((node: HTMLDivElement | null) => {
    previewRef.current = node;
    if (node) {
      node.scrollTop = readingScrollTopRef.current;
    }
  }, []);

  const handlePreviewScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      readingScrollTopRef.current = e.currentTarget.scrollTop;
      if (scrollKey) {
        readingScrollMemory.set(scrollKey, e.currentTarget.scrollTop);
      }
    },
    [scrollKey],
  );

  // Opening a different document in an editor that stays mounted (the workspace
  // panel does this on every file click) has to pick up that document's offset.
  useEffect(() => {
    readingScrollTopRef.current = scrollKey ? readingScrollMemory.get(scrollKey) ?? 0 : 0;
    if (previewRef.current) {
      previewRef.current.scrollTop = readingScrollTopRef.current;
    }
  }, [scrollKey]);

  // ----- Reading-tab search -----
  // Counts against the body because the reading tab renders only the body —
  // counting the full content would desync navigation from rendered marks.
  const matchIndexes = useMemo(() => {
    if (!showSearch || !searchQuery) return [];

    const results: number[] = [];
    const lowerContent = body.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    let index = lowerContent.indexOf(lowerQuery);

    while (index !== -1) {
      results.push(index);
      index = lowerContent.indexOf(lowerQuery, index + 1);
    }

    return results;
  }, [body, searchQuery, showSearch]);

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

  // Search means Monaco's native find while editing, our own overlay while reading.
  const handleSearchButton = useCallback(() => {
    if (view === 'edit') {
      const editor = editorRef.current;
      editor?.focus();
      void editor?.getAction('actions.find')?.run();
    } else {
      openSearch();
    }
  }, [view, openSearch]);

  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
    setSearchNavigationTick((prev) => prev + 1);
  }, [totalMatches]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
    setSearchNavigationTick((prev) => prev + 1);
  }, [totalMatches]);

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

  // Close the reading overlay when switching to the editing tab
  // (Monaco's native find takes over there).
  useEffect(() => {
    if (view === 'edit' && showSearch) {
      closeSearch();
    }
  }, [view, showSearch, closeSearch]);

  const cycleView = useCallback(() => {
    changeView(view === 'edit' ? (diff ? 'diff' : 'preview') : view === 'preview' ? 'edit' : 'preview');
  }, [view, diff, changeView]);

  // Cmd+F opens search in either tab; Cmd+E cycles them. Escape dismisses our
  // own search first and otherwise belongs to the host (closing panel or modal).
  // Monaco swallows both Escape and Cmd+F while its find widget is up, so the
  // editing tab never double-handles them.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSearch) {
          e.preventDefault();
          closeSearch();
          return;
        }
        onEscape?.();
        return;
      }

      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;

      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        handleSearchButton();
      } else if (key === 'e') {
        e.preventDefault();
        cycleView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, closeSearch, onEscape, handleSearchButton, cycleView]);

  // Scroll the reading tab to the current match
  useEffect(() => {
    if (view !== 'preview' || !showSearch || !searchQuery || totalMatches === 0) return;

    const timeoutId = setTimeout(() => {
      const container = previewRef.current;
      if (!container) return;
      const allMatches = Array.from(container.querySelectorAll<HTMLElement>('mark[data-search-match]'));
      const targetMatch =
        allMatches[currentMatchIndex] ??
        container.querySelector<HTMLElement>('[data-current="true"]') ??
        allMatches[0];
      // An explicit 'smooth' here outranks the reduced-motion CSS, so this is
      // the only place that can honour the preference.
      targetMatch?.scrollIntoView({ behavior: scrollBehavior(), block: 'center', inline: 'nearest' });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [view, showSearch, searchQuery, totalMatches, currentMatchIndex, searchNavigationTick]);

  const tabClass = (isActive: boolean) =>
    `h-7 px-2.5 rounded-sm text-sm font-medium transition-colors ${
      isActive
        ? 'bg-surface-3 text-text-primary'
        : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
    }`;

  return (
    <div className="flex flex-col h-full bg-surface-1">
      <div className="flex items-center gap-3 px-3 py-1 min-w-0 bg-surface-1 border-b border-border-subtle">
        {/* The tabs lead, ahead of the host's file name, because their group is
            the only constant-width thing in the row. Sited after the name they
            slid sideways on every document switch — a control you aim at should
            not move when the thing it acts on changes. The rule after them
            keeps the name from reading as a third tab. */}
        <div role="tablist" aria-label="Document view" className="flex items-center gap-0.5 flex-shrink-0">
          {diff && (
            <button
              type="button"
              role="tab"
              id="md-tab-diff"
              aria-selected={view === 'diff'}
              aria-controls="md-panel-diff"
              onClick={() => changeView('diff')}
              className={`${tabClass(view === 'diff')} inline-flex items-center gap-1.5`}
            >
              Diff
              <span className="inline-flex items-center gap-1 text-tiny font-semibold tabular-nums">
                <span className="text-success bg-success-muted px-1 rounded-sm">+{diff.added}</span>
                <span className="text-danger bg-danger-muted px-1 rounded-sm">−{diff.removed}</span>
              </span>
            </button>
          )}
          <Tooltip content="Read the document (⌘E)" side="bottom">
            <button
              type="button"
              role="tab"
              id="md-tab-read"
              aria-selected={view === 'preview'}
              aria-controls="md-panel-read"
              onClick={() => changeView('preview')}
              className={tabClass(view === 'preview')}
            >
              Read
            </button>
          </Tooltip>
          <Tooltip content="Edit the document (⌘E)" side="bottom">
            <button
              type="button"
              role="tab"
              id="md-tab-edit"
              aria-selected={view === 'edit'}
              aria-controls="md-panel-edit"
              onClick={() => changeView('edit')}
              className={tabClass(view === 'edit')}
            >
              Edit
            </button>
          </Tooltip>
        </div>

        {leading && <ToolbarDivider />}
        {leading}

        <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
          <Tooltip content="Find in document (⌘F)" side="bottom">
            <button
              type="button"
              onClick={handleSearchButton}
              aria-label="Find in document"
              className={`w-7 h-7 flex items-center justify-center rounded-sm transition-colors ${
                showSearch
                  ? 'bg-surface-3 text-text-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
              }`}
            >
              <SearchIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          {actions}
        </div>
      </div>

      {/* The formatting strip belongs to the editing tab. Greying it out while
          reading only invites clicks that silently change tab. It wraps rather
          than scrolls: a 12px horizontal scrollbar would clip a 28px button row
          in the narrowest panel, which is exactly when it would appear. */}
      {view === 'edit' && (
        <div className="px-3 py-1 bg-surface-1 border-b border-border-subtle">
          <div className="flex flex-wrap items-center gap-0.5">
            <ToolbarButton onClick={formatBold} title="Bold (⌘B)"><BoldIcon /></ToolbarButton>
            <ToolbarButton onClick={formatItalic} title="Italic (⌘I)"><ItalicIcon /></ToolbarButton>
            <ToolbarButton onClick={formatStrikethrough} title="Strikethrough"><StrikethroughIcon /></ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatH1} title="Heading 1"><HeadingLabel level={1} /></ToolbarButton>
            <ToolbarButton onClick={formatH2} title="Heading 2"><HeadingLabel level={2} /></ToolbarButton>
            <ToolbarButton onClick={formatH3} title="Heading 3"><HeadingLabel level={3} /></ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatCode} title="Inline code (⌘`)"><CodeIcon /></ToolbarButton>
            <ToolbarButton onClick={formatCodeBlock} title="Code block"><CodeBlockIcon /></ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatBulletList} title="Bullet list"><BulletListIcon /></ToolbarButton>
            <ToolbarButton onClick={formatNumberedList} title="Numbered list"><NumberedListIcon /></ToolbarButton>
            <ToolbarButton onClick={formatTaskList} title="Task list"><TaskListIcon /></ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={formatQuote} title="Quote"><QuoteIcon /></ToolbarButton>
            <ToolbarButton onClick={formatHorizontalRule} title="Divider"><HorizontalRuleIcon /></ToolbarButton>
            <ToolbarButton onClick={formatLink} title="Link (⌘K)"><LinkIcon /></ToolbarButton>
          </div>
        </div>
      )}

      {showSearch && view !== 'edit' && (
        <div className="px-3 py-1.5 bg-surface-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <SearchIcon className="w-4 h-4 text-text-muted flex-shrink-0" />

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
              placeholder="Find in document"
              aria-label="Find in document"
              className="input flex-1 min-w-0 py-1"
            />

            {searchQuery && (
              <span
                className={`text-xs tabular-nums whitespace-nowrap ${totalMatches === 0 ? 'text-warning' : 'text-text-muted'}`}
                role="status"
              >
                {totalMatches === 0 ? 'No matches' : `${currentMatchIndex + 1} of ${totalMatches}`}
              </span>
            )}

            <div className="flex items-center gap-0.5">
              <Tooltip content="Previous match (⇧↵)" side="bottom">
                <button
                  type="button"
                  onClick={goToPrevMatch}
                  disabled={totalMatches === 0}
                  className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary
                             hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous match"
                >
                  <ChevronUpIcon />
                </button>
              </Tooltip>
              <Tooltip content="Next match (↵)" side="bottom">
                <button
                  type="button"
                  onClick={goToNextMatch}
                  disabled={totalMatches === 0}
                  className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary
                             hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next match"
                >
                  <ChevronDownIcon />
                </button>
              </Tooltip>
            </div>

            <Tooltip content="Close find (Esc)" side="bottom">
              <button
                type="button"
                onClick={closeSearch}
                className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary
                           hover:bg-surface-3 transition-colors"
                aria-label="Close find"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Monaco stays mounted so its model, undo stack, and find state survive a
          tab switch; the reading pane renders only when it is the active tab, so
          typing never re-parses hidden markdown. */}
      <div className="flex-1 overflow-hidden relative">
        <div
          id="md-panel-edit"
          role="tabpanel"
          aria-labelledby="md-tab-edit"
          className={`absolute inset-0 px-3 bg-surface-1 ${view === 'edit' ? 'block' : 'hidden'}`}
        >
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

        {view === 'diff' && diff && (
          <div
            id="md-panel-diff"
            role="tabpanel"
            aria-labelledby="md-tab-diff"
            className="absolute inset-0 overflow-y-auto bg-surface-1 px-4 py-4"
          >
            {diff.render()}
          </div>
        )}

        {view === 'preview' && (
          <div
            id="md-panel-read"
            role="tabpanel"
            aria-labelledby="md-tab-read"
            ref={attachPreviewNode}
            onScroll={handlePreviewScroll}
            // Reserving the scrollbar's width on both edges keeps the measured
            // column optically centred instead of nudged left by its own bar.
            style={{ scrollbarGutter: 'stable both-edges' }}
            className="absolute inset-0 overflow-y-auto bg-surface-1 select-text cursor-text"
          >
            {localContent ? (
              <div className="px-6 py-8">
                {frontmatter !== null && (
                  <div className="mx-auto max-w-[var(--doc-measure)]">
                    <FrontmatterBlock source={frontmatter} />
                  </div>
                )}
                <article className="prose-document prose-measured">
                  <Markdown options={searchOptions}>{addSoftBreaks(transformPlanRefs(body))}</Markdown>
                </article>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                <FileTextIcon className="w-6 h-6 text-text-muted" />
                <p className="text-sm text-text-secondary">This document is empty.</p>
                <button
                  type="button"
                  onClick={() => changeView('edit')}
                  className="btn btn-secondary"
                >
                  Start writing
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
