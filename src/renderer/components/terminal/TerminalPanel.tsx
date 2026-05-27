import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTerminalStore } from '../../stores/terminalStore';
import { killTerminal } from '../../services/terminalService';
import { TerminalInstance } from './TerminalInstance';

interface TerminalPanelProps {
  /** Resolved cwd for newly created terminals. Falls back to home if undefined. */
  defaultCwd?: string;
  isOpen: boolean;
}

function newId() {
  return `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY_HEIGHT = 'kpm-terminal-panel-height';

export function TerminalPanel({ defaultCwd, isOpen }: TerminalPanelProps) {
  const {
    panelHeight,
    setPanelHeight,
    terminals,
    activeTerminalId,
    addTerminal,
    removeTerminal,
    setActiveTerminal,
    setPanelOpen,
  } = useTerminalStore(
    useShallow((s) => ({
      panelHeight: s.panelHeight,
      setPanelHeight: s.setPanelHeight,
      terminals: s.terminals,
      activeTerminalId: s.activeTerminalId,
      addTerminal: s.addTerminal,
      removeTerminal: s.removeTerminal,
      setActiveTerminal: s.setActiveTerminal,
      setPanelOpen: s.setPanelOpen,
    })),
  );

  // Hydrate persisted height once on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const raw = localStorage.getItem(STORAGE_KEY_HEIGHT);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) setPanelHeight(parsed);
  }, [setPanelHeight]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HEIGHT, String(panelHeight));
  }, [panelHeight]);

  // Re-clamp when the viewport shrinks so the terminal doesn't squash the main content.
  useEffect(() => {
    const handleResize = () => setPanelHeight(panelHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelHeight, setPanelHeight]);

  // Spawn the first terminal on first open. Run only once per mount —
  // a ref guard avoids the lint suppression and the closure-over-defaultCwd hazard.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isOpen || seededRef.current) return;
    seededRef.current = true;
    if (terminals.length === 0) {
      addTerminal({ id: newId(), cwd: defaultCwd, status: 'starting' });
    }
  }, [addTerminal, defaultCwd, isOpen, terminals.length]);

  const handleNewTerminal = useCallback(() => {
    addTerminal({ id: newId(), cwd: defaultCwd, status: 'starting' });
  }, [addTerminal, defaultCwd]);

  const handleCloseTerminal = useCallback(
    (id: string) => {
      void killTerminal(id);
      removeTerminal(id);
    },
    [removeTerminal],
  );

  // Vertical resize: drag the top edge to grow/shrink the panel.
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const draggingRef = useRef(false);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartHeightRef.current = panelHeight;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
    },
    [panelHeight],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Dragging up should grow the panel (panel is anchored to the bottom).
      const delta = dragStartYRef.current - e.clientY;
      setPanelHeight(dragStartHeightRef.current + delta);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [setPanelHeight]);

  return (
    <div
      className={`flex flex-col bg-surface-0 flex-shrink-0 relative overflow-hidden ${
        isOpen ? 'border-t border-border-subtle' : ''
      }`}
      style={{ height: isOpen ? panelHeight : 0 }}
      aria-hidden={!isOpen}
    >
      {isOpen && (
        <>
          <div
            onMouseDown={onResizeStart}
            className="absolute top-0 left-0 right-0 h-1 -translate-y-0.5 cursor-row-resize hover:bg-accent/50 active:bg-accent/70 transition-colors"
          />

          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-subtle bg-surface-1">
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
              {terminals.map((t) => {
                const isActive = t.id === activeTerminalId;
                const label = shortCwd(t.cwd);
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTerminal(t.id)}
                    className={`group flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded text-xs cursor-pointer flex-shrink-0 ${
                      isActive
                        ? 'bg-surface-2 text-text-primary'
                        : 'text-text-secondary hover:bg-surface-2/60'
                    }`}
                    title={t.cwd}
                  >
                    <PromptIcon />
                    <span className="font-mono">{label}</span>
                    {t.status === 'exited' && (
                      <span className="text-text-muted text-[10px]">(exited)</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTerminal(t.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-surface-3 rounded p-0.5 transition-opacity"
                      aria-label="Close terminal"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleNewTerminal}
              className="p-1 rounded hover:bg-surface-2 text-text-secondary hover:text-text-primary"
              aria-label="New terminal"
              title="New terminal"
            >
              <PlusIcon />
            </button>
            <button
              onClick={() => setPanelOpen(false)}
              className="p-1 rounded hover:bg-surface-2 text-text-secondary hover:text-text-primary"
              aria-label="Hide terminal panel"
              title="Hide terminal"
            >
              <ChevronDownIcon />
            </button>
          </div>
        </>
      )}

      <div className="flex-1 min-h-0 relative">
        {terminals.map((t) => {
          const hidden = !isOpen || t.id !== activeTerminalId;
          return (
            <div
              key={t.id}
              className="absolute inset-0"
              style={{ display: hidden ? 'none' : 'block' }}
              aria-hidden={hidden}
            >
              <TerminalInstance id={t.id} cwd={t.cwd} hidden={hidden} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortCwd(cwd?: string): string {
  if (!cwd) return '~';
  const home = '/Users/';
  // Best-effort tilde replacement for display.
  if (cwd.startsWith(home)) {
    const parts = cwd.split('/');
    return '~/' + parts.slice(3).join('/');
  }
  return cwd;
}

function PromptIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 17l6-6-6-6M12 19h8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
