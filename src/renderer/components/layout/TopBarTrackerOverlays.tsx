import { Suspense, memo } from 'react';
import type { ComponentProps } from 'react';
import { useCredentialStore, useExportStore, useSyncStore, useTrackerStore } from '../../stores';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import type { TopBarTrackerOverlaysContent } from './TopBarTrackerOverlaysContent';

const Content = lazyWithRetry(() =>
  import('./TopBarTrackerOverlaysContent').then((m) => ({ default: m.TopBarTrackerOverlaysContent })),
);

type OverlayProps = ComponentProps<typeof TopBarTrackerOverlaysContent>;

/** Loads the tracker dialogs the first time one of them opens. */
export const TopBarTrackerOverlays = memo(function TopBarTrackerOverlays(props: OverlayProps) {
  const anyOpen = [
    useCredentialStore((state) => state.showDialog),
    useTrackerStore((state) => state.showAssociationDialog),
    useSyncStore((state) => state.showPanel),
    useExportStore((state) => state.showQueuePanel),
    useExportStore((state) => state.showMappingDialog),
    props.syncPanelAssociationId !== null,
  ].some(Boolean);

  if (!anyOpen) return null;
  return (
    <Suspense fallback={null}>
      <Content {...props} />
    </Suspense>
  );
});
