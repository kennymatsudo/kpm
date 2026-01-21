/**
 * Canvas Viewport Hook
 *
 * Manages pan, zoom, and persistence for canvas state.
 * Extracted from Canvas.tsx for better separation of concerns.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

/** Debounce delay for persisting canvas state (ms) */
const PERSIST_DEBOUNCE_MS = 300;

/** Storage key for persisting canvas state */
const getStorageKey = (projectId: string) => `kpm-canvas-${projectId}`;

interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
}

interface ItemPosition {
  position_x: number | null;
  position_y: number | null;
  group_id?: string | null;
}

interface GroupPosition {
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

interface UseCanvasViewportOptions {
  projectId: string;
  /** Items with positions - used by resetView to center on content */
  items?: ItemPosition[];
  /** Groups with positions and sizes - used by resetView to center on content */
  groups?: GroupPosition[];
}

interface UseCanvasViewportReturn {
  /** User-facing zoom value (1 = 100% displayed) */
  zoom: number;
  /** Actual rendering scale (zoom * ZOOM.BASE) */
  effectiveZoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  panOffset: { x: number; y: number };
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isPanning: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  resetView: () => void;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  panHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

export function useCanvasViewport({
  projectId,
  items = [],
  groups = [],
}: UseCanvasViewportOptions): UseCanvasViewportReturn {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Effective zoom = user zoom * base scale factor
  // When user sees "100%", actual rendering scale is 0.75
  const effectiveZoom = useMemo(() => zoom * ZOOM.BASE, [zoom]);

  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const panRafRef = useRef<number | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);

  // Ref for debounced state persistence
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if we've initialized viewport for no-saved-state case
  const hasInitializedRef = useRef<string | null>(null);

  // Load persisted canvas state on mount or project change
  useEffect(() => {
    // Only run once per project
    if (hasInitializedRef.current === projectId) return;

    try {
      const saved = localStorage.getItem(getStorageKey(projectId));
      if (saved) {
        const state: CanvasState = JSON.parse(saved);
        setZoom(state.zoom);
        setPanOffset({ x: state.panX, y: state.panY });
        hasInitializedRef.current = projectId;
      } else {
        // No saved state - calculate viewport to center content (items + groups)
        const positionedItems = items.filter(
          (item): item is { position_x: number; position_y: number } =>
            item.position_x !== null && item.position_y !== null
        );

        const hasItems = positionedItems.length > 0;
        const hasGroups = groups.length > 0;

        if (hasItems || hasGroups) {
          // Find bounding box including both items and groups
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;

          // Include items in bounding box
          const estimatedItemWidth = 300;
          const estimatedItemHeight = 150;
          for (const item of positionedItems) {
            minX = Math.min(minX, item.position_x);
            maxX = Math.max(maxX, item.position_x + estimatedItemWidth);
            minY = Math.min(minY, item.position_y);
            maxY = Math.max(maxY, item.position_y + estimatedItemHeight);
          }

          // Include groups in bounding box
          for (const group of groups) {
            minX = Math.min(minX, group.position_x);
            maxX = Math.max(maxX, group.position_x + group.width);
            minY = Math.min(minY, group.position_y);
            maxY = Math.max(maxY, group.position_y + group.height);
          }

          const contentCenterX = (minX + maxX) / 2;
          const contentCenterY = (minY + maxY) / 2;

          const screenWidth = containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
          const screenHeight = containerRef.current?.getBoundingClientRect().height ?? window.innerHeight;

          setZoom(1);
          setPanOffset({
            x: screenWidth / 2 - contentCenterX * ZOOM.BASE,
            y: screenHeight / 2 - contentCenterY * ZOOM.BASE,
          });
          hasInitializedRef.current = projectId;
        } else if (items.length === 0 && groups.length === 0) {
          // No content yet - use default position
          setZoom(1);
          setPanOffset({ x: 0, y: 0 });
          hasInitializedRef.current = projectId;
        }
        // If items exist but none have positions, wait for auto-layout to position them
      }
    } catch {
      // Ignore parse errors
      hasInitializedRef.current = projectId;
    }
  }, [projectId, items, groups]);

  // Persist canvas state on changes (debounced)
  useEffect(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      const state: CanvasState = { zoom, panX: panOffset.x, panY: panOffset.y };
      localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [projectId, zoom, panOffset]);

  // Calculate canvas coordinates from screen coordinates
  // Uses effectiveZoom (actual rendering scale) for accurate conversion
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - panOffset.x) / effectiveZoom;
    const y = (screenY - rect.top - panOffset.y) / effectiveZoom;
    return { x, y };
  }, [panOffset, effectiveZoom]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isOnCard = target.closest('[data-plan-card]');

    // Pan with middle mouse button, or left click on empty space
    if (e.button === 1 || (e.button === 0 && !isOnCard)) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOffsetStartRef.current = { ...panOffset };
    }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;

    lastMouseRef.current = { x: e.clientX, y: e.clientY };

    if (!panRafRef.current) {
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = null;
        const last = lastMouseRef.current;
        if (!last) return;
        const dx = last.x - panStartRef.current.x;
        const dy = last.y - panStartRef.current.y;
        setPanOffset({
          x: panOffsetStartRef.current.x + dx,
          y: panOffsetStartRef.current.y + dy,
        });
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    lastMouseRef.current = null;
    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    lastMouseRef.current = null;
    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }

  const resetView = useCallback(() => {
    setZoom(1);

    // Only consider UNGROUPED items with valid positions
    // Items in groups have their position determined by the group
    // Items with negative positions are likely stale/corrupted data
    const ungroupedItems = items.filter(
      (item): item is { position_x: number; position_y: number; group_id?: string | null } =>
        item.position_x !== null &&
        item.position_y !== null &&
        item.position_x >= 0 &&
        item.position_y >= 0 &&
        !item.group_id // Exclude items assigned to groups
    );

    const hasItems = ungroupedItems.length > 0;
    const hasGroups = groups.length > 0;

    if (!hasItems && !hasGroups) {
      // No content - reset to origin
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    // Find top-left corner of content
    let minX = Infinity;
    let minY = Infinity;

    // Consider ungrouped items
    for (const item of ungroupedItems) {
      minX = Math.min(minX, item.position_x);
      minY = Math.min(minY, item.position_y);
    }

    // Consider groups (their position determines where their contained items appear)
    for (const group of groups) {
      minX = Math.min(minX, group.position_x);
      minY = Math.min(minY, group.position_y);
    }

    // At zoom=1, effectiveZoom = ZOOM.BASE
    const effectiveZoom = ZOOM.BASE;

    // Position content at same screen position as auto-layout:
    // Auto-layout places content at canvas x=40, with pan=(0,0) that's screen x=30
    // We want the leftmost content to appear at screen x=30 regardless of its canvas position
    const targetScreenX = 30;
    const targetScreenY = 30;
    setPanOffset({
      x: targetScreenX - minX * effectiveZoom,
      y: targetScreenY - minY * effectiveZoom,
    });
  }, [items, groups]);

  useEffect(() => {
    return () => {
      if (panRafRef.current) {
        cancelAnimationFrame(panRafRef.current);
      }
    };
  }, []);

  return {
    zoom,
    effectiveZoom,
    setZoom,
    panOffset,
    setPanOffset,
    isPanning,
    containerRef,
    resetView,
    screenToCanvas,
    panHandlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
    },
  };
}
