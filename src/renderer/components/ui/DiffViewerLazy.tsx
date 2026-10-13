import { Suspense } from 'react';
import type { DiffViewerProps } from './DiffViewer';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const DiffViewer = lazyWithRetry(() =>
  import('./DiffViewer').then((m) => ({ default: m.DiffViewer })),
);

export function DiffViewerLazy(props: DiffViewerProps) {
  return (
    <Suspense fallback={<div className="min-h-16 bg-surface-1" />}>
      <DiffViewer {...props} />
    </Suspense>
  );
}
