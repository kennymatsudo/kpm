import { lazy, Suspense } from 'react';

interface MermaidDiagramLazyProps {
  source: string;
}

const MermaidDiagram = lazy(() =>
  import('./MermaidDiagram').then((m) => ({ default: m.MermaidDiagram })),
);

export function MermaidDiagramLazy({ source }: MermaidDiagramLazyProps) {
  return (
    <Suspense fallback={<pre><code>{source}</code></pre>}>
      <MermaidDiagram source={source} />
    </Suspense>
  );
}
