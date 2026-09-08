import { Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

interface MermaidDiagramLazyProps {
  source: string;
}

const MermaidDiagram = lazyWithRetry(() =>
  import('./MermaidDiagram').then((m) => ({ default: m.MermaidDiagram })),
);

export function MermaidDiagramLazy({ source }: MermaidDiagramLazyProps) {
  return (
    <Suspense fallback={<pre><code>{source}</code></pre>}>
      <MermaidDiagram source={source} />
    </Suspense>
  );
}
