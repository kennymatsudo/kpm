/**
 * Canvas Wheel Event Hook
 *
 * Handles scroll-to-pan and Cmd/Ctrl+scroll-to-zoom with RAF throttling.
 * Extracted from Canvas.tsx for better separation of concerns.
 */

import { useEffect, useRef } from 'react';
import { ZOOM } from '../../../constants/layout';

interface UseCanvasWheelOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function useCanvasWheel({
  containerRef,
  setZoom,
  setPanOffset,
}: UseCanvasWheelOptions): void {
  // Refs for RAF-throttled scroll panning/zooming
  const rafRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const zoomRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ delta: number; screenX: number; screenY: number } | null>(null);
  // Anchor point for zoom gestures - stored in canvas coordinates
  const zoomAnchorRef = useRef<{ canvasX: number; canvasY: number } | null>(null);
  const zoomGestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl + scroll = zoom toward cursor
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Reset gesture timeout - anchor point clears after 150ms of no scrolling
        if (zoomGestureTimeoutRef.current) {
          clearTimeout(zoomGestureTimeoutRef.current);
        }
        zoomGestureTimeoutRef.current = setTimeout(() => {
          zoomAnchorRef.current = null;
        }, 150);

        // Accumulate zoom delta
        if (!pendingZoomRef.current) {
          pendingZoomRef.current = { delta: 0, screenX, screenY };
        }
        pendingZoomRef.current.delta += e.deltaY > 0 ? -ZOOM.SCROLL_STEP : ZOOM.SCROLL_STEP;

        if (!zoomRafRef.current) {
          zoomRafRef.current = requestAnimationFrame(() => {
            const pending = pendingZoomRef.current;
            if (pending) {
              const { delta, screenX: sx, screenY: sy } = pending;
              pendingZoomRef.current = null;

              setZoom(prevZoom => {
                const newZoom = Math.min(ZOOM.MAX, Math.max(ZOOM.MIN, prevZoom + delta));
                if (newZoom === prevZoom) return prevZoom;

                setPanOffset(prevPan => {
                  // On first zoom of gesture, calculate and store the canvas anchor point
                  if (!zoomAnchorRef.current) {
                    zoomAnchorRef.current = {
                      canvasX: (sx - prevPan.x) / prevZoom,
                      canvasY: (sy - prevPan.y) / prevZoom,
                    };
                  }

                  const { canvasX, canvasY } = zoomAnchorRef.current;

                  // Adjust pan so the anchor point stays at the same screen position
                  return {
                    x: sx - canvasX * newZoom,
                    y: sy - canvasY * newZoom,
                  };
                });

                return newZoom;
              });
            }
            zoomRafRef.current = null;
          });
        }
      } else {
        // Pan - accumulate deltas and apply via RAF for smooth 60fps updates
        if (!pendingPanRef.current) {
          pendingPanRef.current = { x: 0, y: 0 };
        }
        pendingPanRef.current.x -= e.deltaX;
        pendingPanRef.current.y -= e.deltaY;

        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            const pending = pendingPanRef.current;
            if (pending) {
              pendingPanRef.current = null;
              setPanOffset(offset => ({
                x: offset.x + pending.x,
                y: offset.y + pending.y,
              }));
            }
            rafRef.current = null;
          });
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      if (zoomGestureTimeoutRef.current) {
        clearTimeout(zoomGestureTimeoutRef.current);
      }
    };
}
