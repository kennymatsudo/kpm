import { Suspense } from 'react';
import type { MarkdownEditorProps } from './MarkdownEditor';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const MarkdownEditor = lazyWithRetry(() =>
  import('./MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
);

export function MarkdownEditorLazy(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<div className="h-full bg-surface-0" />}>
      <MarkdownEditor {...props} />
    </Suspense>
  );
}
