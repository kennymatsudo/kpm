import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import {
  createTerminal,
  writeToTerminal,
  resizeTerminal,
  killTerminal,
  onTerminalData,
  onTerminalExit,
} from '../../services/terminalService';

interface TerminalInstanceProps {
  id: string;
  cwd?: string;
  hidden: boolean;
}

function resolveTheme() {
  const styles = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: v('--color-surface-0', '#0d0f12'),
    foreground: v('--color-text-primary', '#e6e6e6'),
    cursor: v('--color-accent', '#7aa2f7'),
    cursorAccent: v('--color-surface-0', '#0d0f12'),
    selectionBackground: v('--color-accent-muted', '#3b4252'),
  };
}

export function TerminalInstance({ id, cwd, hidden }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);

  // Mount/teardown the xterm instance and PTY for this id.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: resolveTheme(),
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      // container may not be sized yet; resize observer will handle it
    }
    const { cols, rows } = term;

    const ptyId = `${id}-${globalThis.crypto.randomUUID()}`;
    ptyIdRef.current = ptyId;
    let cancelled = false;
    const dataUnsub = onTerminalData((event) => {
      if (event.id !== ptyId) return;
      term.write(event.data);
    });
    const exitUnsub = onTerminalExit((event) => {
      if (event.id !== ptyId) return;
      setTerminalStatus(id, 'exited', event.exitCode);
      term.write(`\r\n\x1b[2m[process exited with code ${event.exitCode}]\x1b[0m\r\n`);
    });
    const inputDisposable = term.onData((data) => {
      void writeToTerminal(ptyId, data);
    });

    void createTerminal({ id: ptyId, cwd, cols, rows }).then((res) => {
      if (cancelled) {
        if (res.success) void killTerminal(ptyId);
        return;
      }
      if (!res.success) {
        term.write(`\r\n\x1b[31m[terminal] failed to start: ${res.error ?? 'unknown error'}\x1b[0m\r\n`);
        setTerminalStatus(id, 'exited', 1);
        return;
      }
      setTerminalStatus(id, 'running');

      term.focus();
    });

    return () => {
      cancelled = true;
      dataUnsub();
      exitUnsub();
      inputDisposable.dispose();
      void killTerminal(ptyId);
      term.dispose();
      if (ptyIdRef.current === ptyId) {
        ptyIdRef.current = null;
      }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, cwd, setTerminalStatus]);

  // Refit and resize PTY when the container changes size or visibility toggles.
  useEffect(() => {
    if (!containerRef.current) return;
    const target = containerRef.current;

    const refit = () => {
      const term = termRef.current;
      const fit = fitRef.current;
      const ptyId = ptyIdRef.current;
      if (!term || !fit || !ptyId) return;
      try {
        fit.fit();
        void resizeTerminal(ptyId, term.cols, term.rows);
      } catch {
        // ignore — container not sized yet
      }
    };

    const ro = new ResizeObserver(() => refit());
    ro.observe(target);
    return () => ro.disconnect();
  }, [id]);

  // When this tab becomes visible, focus and refit (offscreen xterms can't measure).
  useEffect(() => {
    if (hidden) return;
    const term = termRef.current;
    const fit = fitRef.current;
    requestAnimationFrame(() => {
      try {
        const ptyId = ptyIdRef.current;
        if (!ptyId) return;
        fit.fit();
        void resizeTerminal(ptyId, term.cols, term.rows);
        term.focus();
      } catch {
        // ignore
      }
    });
  }, [hidden, id]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full px-2 pt-1"
      style={{ display: hidden ? 'none' : 'block' }}
    />
  );
}
