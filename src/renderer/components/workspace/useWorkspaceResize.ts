
const CHAT_MIN = 320;
const CHAT_DEFAULT = 420;
const STORAGE_KEY = 'kpm-workspace-chat-width';

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return CHAT_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return CHAT_DEFAULT;
}

export interface UseWorkspaceResizeReturn {
  workspaceChatWidth: number;
  isResizing: boolean;
  handleResizeStart: (e: React.MouseEvent) => void;
}

  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, width.toString());
  }, [width]);

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
      // Dragging left = chat wider (inverted delta)
      const delta = resizeStartX.current - e.clientX;
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
  }, [isResizing]);

  return {
    workspaceChatWidth: width,
    isResizing,
    handleResizeStart,
  };
}
