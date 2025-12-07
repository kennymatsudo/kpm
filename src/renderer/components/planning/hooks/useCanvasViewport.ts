/**
 * Canvas Viewport Hook
 *
 * Manages pan, zoom, and persistence for canvas state.
 * Extracted from Canvas.tsx for better separation of concerns.
 */


/** Debounce delay for persisting canvas state (ms) */
const PERSIST_DEBOUNCE_MS = 300;

/** Storage key for persisting canvas state */
const getStorageKey = (projectId: string) => `kpm-canvas-${projectId}`;

interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
}

interface UseCanvasViewportOptions {
  projectId: string;
}

interface UseCanvasViewportReturn {
  zoom: number;
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
}: UseCanvasViewportOptions): UseCanvasViewportReturn {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref for debounced state persistence
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted canvas state on mount or project change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(projectId));
      if (saved) {
        const state: CanvasState = JSON.parse(saved);
        setZoom(state.zoom);
        setPanOffset({ x: state.panX, y: state.panY });
      } else {
      }
    } catch {
      // Ignore parse errors
    }

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
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x, y };

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

  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);

  const resetView = useCallback(() => {
    setZoom(1);

  return {
    zoom,
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
