import MonacoEditor from '@monaco-editor/react';
import type { BeforeMount, OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { configureMonaco, getMonacoLanguage } from '../../lib/monaco';

export interface CodeEditorProps {
  content: string;
  path: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
}

const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 24,
  fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace)',
  padding: { top: 16, bottom: 16 },
  roundedSelection: false,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  renderLineHighlight: 'all',
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  wordWrap: 'on',
  wrappingIndent: 'indent',
  quickSuggestions: {
    comments: false,
    strings: true,
    other: true,
  },
  suggestOnTriggerCharacters: true,
  tabSize: 2,
  insertSpaces: true,
  formatOnPaste: true,
  formatOnType: true,
};

type MonacoInstance = typeof Monaco;
export function CodeEditor({
  content,
  path,
  onChange,
  isReadOnly = false,
}: CodeEditorProps) {
  useMemo(() => configureMonaco(), []);
  const language = useMemo(() => getMonacoLanguage(path), [path]);

  const beforeMount: BeforeMount = (monacoInstance) => {
  };

  const handleMount: OnMount = (editor, monacoInstance) => {
    editor.getModel()?.updateOptions({ tabSize: 2, insertSpaces: true });
  };

  return (
    <div className="h-full bg-surface-1">
      <MonacoEditor
        path={path}
        value={content}
        language={language}
        beforeMount={beforeMount}
        onMount={handleMount}
        onChange={(value) => onChange?.(value ?? '')}
        options={{
          ...EDITOR_OPTIONS,
          readOnly: isReadOnly,
          domReadOnly: isReadOnly,
          renderValidationDecorations: isReadOnly ? 'off' : 'editable',
        }}
      />
    </div>
  );
}
