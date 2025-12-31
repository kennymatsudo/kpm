import { useState, useEffect, useRef, useCallback } from 'react';

// Panel size constraints
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240;
const CHAT_MIN = 280;
const CHAT_DEFAULT = 384; // 24rem = 384px

// localStorage keys
const STORAGE_KEY_SIDEBAR = 'kpm-sidebar-width';
const STORAGE_KEY_CHAT = 'kpm-chat-width';

export interface UsePanelResizeReturn {
  sidebarWidth: number;
  chatWidth: number;
  handleSidebarResizeStart: (e: React.MouseEvent) => void;
  handleChatResizeStart: (e: React.MouseEvent) => void;
}

export function usePanelResize(): UsePanelResizeReturn {
  // Panel widths with localStorage persistence

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
        pendingWidthRef.current.sidebar = newWidth;
      } else if (isResizingChat) {
        // Chat resizes from the left edge, so delta is inverted
        const delta = resizeStartX.current - e.clientX;
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

  return {
    sidebarWidth,
    chatWidth,
    handleSidebarResizeStart,
    handleChatResizeStart,
  };
}
