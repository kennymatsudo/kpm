import { Suspense, useState } from 'react';
import { useContextRegenerationStore } from '../../stores';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const RegenerateContextModal = lazyWithRetry(() =>
  import('./RegenerateContextModal').then((m) => ({ default: m.RegenerateContextModal })),
);

/**
 * Loads the modal the first time it opens, then keeps it mounted so a
 * generation that outlives closing the modal keeps its state.
 */
export function RegenerateContextModalLazy() {
  const isOpen = useContextRegenerationStore((state) => state.isOpen);
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);

  if (!hasOpened) return null;
  return (
    <Suspense fallback={null}>
      <RegenerateContextModal />
    </Suspense>
  );
}
