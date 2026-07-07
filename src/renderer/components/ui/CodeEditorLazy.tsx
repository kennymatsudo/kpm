import { lazy, Suspense } from 'react';
import type { CodeEditorProps } from './CodeEditor';

const CodeEditor = lazy(() =>
  import('./CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

export function CodeEditorLazy(props: CodeEditorProps) {
  return (
    <Suspense fallback={<div className="h-full bg-surface-1" />}>
      <CodeEditor {...props} />
    </Suspense>
  );
}
