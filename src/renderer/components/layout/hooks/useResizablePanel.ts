import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { clampWidth, resolvePanelMax } from '../../../utils/panelSizing';
import type { PanelSizeConfig } from '../../../constants/layout';

export interface UseResizablePanelOptions {
  containerRef?: RefObject<HTMLDivElement | null>;
  reservedWidth?: number;
}

export interface UseResizablePanelReturn {
  width: number;
  isResizing: boolean;
  handleResizeStart: (e: React.MouseEvent) => void;
}

function getAvailableWidth(containerRef?: RefObject<HTMLDivElement | null>): number {
  return containerRef?.current?.offsetWidth ?? window.innerWidth;
}

function getMax(
  config: PanelSizeConfig,
  containerRef: RefObject<HTMLDivElement | null> | undefined,
  reservedWidth: number
): number {
  return resolvePanelMax(config, {
    viewportWidth: getAvailableWidth(containerRef),
    reservedWidth,
  });
}

function readStoredWidth(config: PanelSizeConfig, max: number): number {
  const raw = localStorage.getItem(config.storageKey);
  if (!raw) return config.default;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return config.default;

  return clampWidth(parsed, config.min, max);
}

export function useResizablePanel(
  config: PanelSizeConfig,
  options: UseResizablePanelOptions = {}
): UseResizablePanelReturn {
  const { containerRef, reservedWidth = 0 } = options;

  const [width, setWidth] = useState(() =>
    readStoredWidth(config, getMax(config, containerRef, reservedWidth))
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  useEffect(() => {
    localStorage.setItem(config.storageKey, width.toString());
  }, [config.storageKey, width]);

  useEffect(() => {
    if (config.viewportFraction === undefined) return;

    const reclamp = () => {
      const max = getMax(config, containerRef, reservedWidth);
      setWidth((current) => (current > max ? max : current));
    };

    reclamp();

    if (containerRef?.current) {
      const observer = new ResizeObserver(reclamp);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, [config, containerRef, reservedWidth]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = width;
    },
    [width]
  );

  const rafRef = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rawDelta = e.clientX - resizeStartX.current;
      const delta = config.invertDrag ? -rawDelta : rawDelta;
      const max = getMax(config, containerRef, reservedWidth);
      const newWidth = clampWidth(resizeStartWidth.current + delta, config.min, max);
      pendingWidth.current = newWidth;

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingWidth.current !== null) {
            setWidth(pendingWidth.current);
            pendingWidth.current = null;
          }
          rafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingWidth.current !== null) {
        setWidth(pendingWidth.current);
        pendingWidth.current = null;
      }
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isResizing, config, containerRef, reservedWidth]);

  return { width, isResizing, handleResizeStart };
}
