import { useRef, useCallback, useEffect } from 'react';
import type { PlanItem } from '../../../../shared/types';
import type { AutoLayoutOptions } from './useAutoLayout';

interface UseCanvasAutoLayoutTriggerDeps {
  projectId: string;
  items: PlanItem[];
  hasItemsNeedingLayout: boolean;
  effectiveZoom: number;
  onAutoLayout: (options?: AutoLayoutOptions) => Promise<void>;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface UseCanvasAutoLayoutTriggerReturn {
  getStableViewportDimensions: () => Promise<{ width: number; height: number } | undefined>;
}

export function useCanvasAutoLayoutTrigger({
  projectId,
  items,
  hasItemsNeedingLayout,
  effectiveZoom,
  onAutoLayout,
  containerRef,
}: UseCanvasAutoLayoutTriggerDeps): UseCanvasAutoLayoutTriggerReturn {
  const hasAutoLayoutRef = useRef(false);
  const prevItemCountRef = useRef(0);
  const prevItemIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    hasAutoLayoutRef.current = false;
    prevItemCountRef.current = 0;
    prevItemIdsRef.current = new Set();
  }, [projectId]);

  // Measure viewport dimensions after layout settles (e.g. panel collapse/expand).
  const getStableViewportDimensions = useCallback(async (): Promise<{ width: number; height: number } | undefined> => {
    const element = containerRef.current;
    if (!element) return undefined;

    const readRect = () => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };

    const nextFrame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    let current = readRect();
    const maxFrames = 4;

    for (let i = 0; i < maxFrames; i++) {
      await nextFrame();
      const next = readRect();
      const widthDelta = Math.abs(next.width - current.width);
      const heightDelta = Math.abs(next.height - current.height);
      current = next;

      if (widthDelta < 0.5 && heightDelta < 0.5) {
        break;
      }
    }

    if (current.width <= 0 || current.height <= 0) return undefined;
    return current;
  }, [containerRef]);

  useEffect(() => {
    let cancelled = false;

    const currentItemIds = new Set(items.map(item => item.id));
    const prevItemIds = prevItemIdsRef.current;

    const itemsAdded = [...currentItemIds].some(id => !prevItemIds.has(id));
    const itemsRemoved = [...prevItemIds].some(id => !currentItemIds.has(id));
    const filterChanged = itemsAdded || itemsRemoved;

    const currentItemCount = items.length;
    const isNewItems = currentItemCount > prevItemCountRef.current;
    prevItemCountRef.current = currentItemCount;
    prevItemIdsRef.current = currentItemIds;

    const runAutoLayout = async (forceFullLayout = false) => {
      const dimensions = await getStableViewportDimensions();
      if (cancelled) return;
      await onAutoLayout({
        dimensions,
        effectiveZoom,
        forceFullLayout,
      });
    };

    // When filtered items appear/disappear, card heights change, requiring repositioning
    if (filterChanged && prevItemIds.size > 0) {
      const itemMap2 = new Map(items.map(i => [i.id, i]));
      const newItemsNeedPosition = [...currentItemIds]
        .filter(id => !prevItemIds.has(id))
        .some(id => {
          const item = itemMap2.get(id);
          return item?.position_x === null || item?.position_y === null;
        });
      if (newItemsNeedPosition) {
        void runAutoLayout();
      }
      return () => {
        cancelled = true;
      };
    }

    if (hasItemsNeedingLayout && (isNewItems || !hasAutoLayoutRef.current)) {
      hasAutoLayoutRef.current = true;
      void runAutoLayout();
    }

    return () => {
      cancelled = true;
    };
  }, [items, hasItemsNeedingLayout, effectiveZoom, onAutoLayout, getStableViewportDimensions]);

  return { getStableViewportDimensions };
}
