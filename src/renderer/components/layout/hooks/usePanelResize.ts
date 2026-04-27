import { useState, useEffect, useRef, useCallback } from 'react';
import { clampWidth, getViewportBoundedMax } from '../../../utils/panelSizing';

// Panel size constraints
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240;
const CHAT_MIN = 280;
const CHAT_MAX_ABS = 1600;
const CHAT_MAX_VIEWPORT_FRACTION = 0.75;
const CHAT_DEFAULT = 384; // 24rem = 384px
const MAIN_CONTENT_MIN = 480;

// localStorage keys
const STORAGE_KEY_SIDEBAR = 'kpm-sidebar-width';
const STORAGE_KEY_CHAT = 'kpm-chat-width';

function getChatMax(sidebarWidth: number): number {
  return getViewportBoundedMax({
    min: CHAT_MIN,
    hardMax: CHAT_MAX_ABS,
    viewportFraction: CHAT_MAX_VIEWPORT_FRACTION,
    reservedWidth: sidebarWidth,
    remainingMinWidth: MAIN_CONTENT_MIN,
  });
}

function readStoredWidth(key: string, min: number, max: number, defaultWidth: number): number {
  const raw = localStorage.getItem(key);
  if (!raw) return defaultWidth;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultWidth;

  return clampWidth(parsed, min, max);
}

export interface UsePanelResizeReturn {
  sidebarWidth: number;
  chatWidth: number;
  handleSidebarResizeStart: (e: React.MouseEvent) => void;
  handleChatResizeStart: (e: React.MouseEvent) => void;
}

export function usePanelResize(): UsePanelResizeReturn {
  // Panel widths with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(STORAGE_KEY_SIDEBAR, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT)
  );
  const [chatWidth, setChatWidth] = useState(() => {
    const initialSidebarWidth = readStoredWidth(STORAGE_KEY_SIDEBAR, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT);
    return readStoredWidth(STORAGE_KEY_CHAT, CHAT_MIN, getChatMax(initialSidebarWidth), CHAT_DEFAULT);
  });

  // Resize state
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Persist widths to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SIDEBAR, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CHAT, chatWidth.toString());
  }, [chatWidth]);

  // Re-clamp chat width when the window or sidebar changes so it leaves room for the main canvas.
  useEffect(() => {
    const clampChatWidth = () => {
      const max = getChatMax(sidebarWidth);
      setChatWidth((current) => (current > max ? max : current));
    };
    clampChatWidth();
    window.addEventListener('resize', clampChatWidth);
    return () => window.removeEventListener('resize', clampChatWidth);
  }, [sidebarWidth]);

  // Sidebar resize handlers
  const handleSidebarResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingSidebar(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = sidebarWidth;
    },
    [sidebarWidth]
  );

  // Chat resize handlers
  const handleChatResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingChat(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = chatWidth;
    },
    [chatWidth]
  );

  // Global mouse move/up handlers for resizing (throttled with RAF)
  const rafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<{ sidebar?: number; chat?: number }>({});

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const delta = e.clientX - resizeStartX.current;
        const newWidth = clampWidth(resizeStartWidth.current + delta, SIDEBAR_MIN, SIDEBAR_MAX);
        pendingWidthRef.current.sidebar = newWidth;
      } else if (isResizingChat) {
        // Chat resizes from the left edge, so delta is inverted
        const delta = resizeStartX.current - e.clientX;
        const newWidth = clampWidth(resizeStartWidth.current + delta, CHAT_MIN, getChatMax(sidebarWidth));
        pendingWidthRef.current.chat = newWidth;
      }

      // Throttle state updates using requestAnimationFrame
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingWidthRef.current.sidebar !== undefined) {
            setSidebarWidth(pendingWidthRef.current.sidebar);
          }
          if (pendingWidthRef.current.chat !== undefined) {
            setChatWidth(pendingWidthRef.current.chat);
          }
          pendingWidthRef.current = {};
          rafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      // Apply any pending width changes immediately on mouse up
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingWidthRef.current.sidebar !== undefined) {
        setSidebarWidth(pendingWidthRef.current.sidebar);
      }
      if (pendingWidthRef.current.chat !== undefined) {
        setChatWidth(pendingWidthRef.current.chat);
      }
      pendingWidthRef.current = {};
      setIsResizingSidebar(false);
      setIsResizingChat(false);
    };

    if (isResizingSidebar || isResizingChat) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

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
  }, [isResizingSidebar, isResizingChat, sidebarWidth]);

  return {
    sidebarWidth,
    chatWidth,
    handleSidebarResizeStart,
    handleChatResizeStart,
  };
}
