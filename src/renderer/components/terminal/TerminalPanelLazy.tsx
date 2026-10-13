import { Suspense } from 'react';
import type { ComponentProps } from 'react';
import type { TerminalPanel as TerminalPanelComponent } from './TerminalPanel';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const TerminalPanel = lazyWithRetry(() =>
  import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel })),
);

export function TerminalPanelLazy(props: ComponentProps<typeof TerminalPanelComponent>) {
  return (
    <Suspense fallback={null}>
      <TerminalPanel {...props} />
    </Suspense>
  );
}
