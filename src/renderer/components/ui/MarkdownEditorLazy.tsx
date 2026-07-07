import { lazy, Suspense } from 'react';
import type { MarkdownEditorProps } from './MarkdownEditor';

const MarkdownEditor = lazy(() =>
  import('./MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
);

export function MarkdownEditorLazy(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<div className="h-full bg-surface-0" />}>
      <MarkdownEditor {...props} />
    </Suspense>
  );
}
