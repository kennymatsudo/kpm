import { Suspense } from 'react';
import type { ComponentProps } from 'react';
import type { SettingsModal as SettingsModalComponent } from './SettingsModal';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const SettingsModal = lazyWithRetry(() =>
  import('./SettingsModal').then((m) => ({ default: m.SettingsModal })),
);

export function SettingsModalLazy(props: ComponentProps<typeof SettingsModalComponent>) {
  return (
    <Suspense fallback={null}>
      <SettingsModal {...props} />
    </Suspense>
  );
}
