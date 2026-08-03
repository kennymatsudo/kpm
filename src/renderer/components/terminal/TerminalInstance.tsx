import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import { graphiteColors } from '../../../shared/theme';
import {
  subscribeToTerminal,
  attachTerminal,
  detachTerminal,
  writeToTerminal,
  resizeTerminal,
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
    cursor: v('--color-accent', graphiteColors.accent),
    cursorAccent: v('--color-surface-0', '#0d0f12'),
    selectionBackground: v('--color-accent-muted', '#3b4252'),
  };
}

export function TerminalInstance({ id, cwd, hidden }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);
  const applySessionSnapshot = useTerminalStore((s) => s.applySessionSnapshot);
  // `cwd` only decides where a new session spawns, and the attach response
  // writes main's resolved path back onto the entry — so reading the prop
  // directly below would tear the view down and respawn it whenever the
  // resolved path differs from the requested one.
  const initialCwdRef = useRef(cwd);

  // Mount/teardown the xterm view for this session id. Teardown detaches and
  // never kills: the session outlives its view, so a remount replays the
  // scrollback instead of spawning a second shell.
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

    let cancelled = false;
    const unsubscribe = subscribeToTerminal(id, {
      onData: (chunk) => term.write(chunk),
      onExit: (exitCode) => {
        setTerminalStatus(id, 'exited', exitCode);
        term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      },
    });
    const inputDisposable = term.onData((data) => {
      void writeToTerminal(id, data);
    });

    // Shift+Enter → ESC+CR. xterm.js sends plain `\r` for both Enter and
    // Shift+Enter, which TUIs like Claude Code can't disambiguate. Real
    // terminals (iTerm2, Terminal.app) map Shift/Option+Enter to `\x1b\r`,
    // which Claude Code reads as "newline within message" rather than submit.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
        void writeToTerminal(id, '\x1b\r');
        return false;
      }
      return true;
    });

    const reportStartFailure = (reason: string) => {
      term.write(`\r\n\x1b[31m[terminal] failed to start: ${reason}\x1b[0m\r\n`);
      setTerminalStatus(id, 'exited', 1);
    };

    void attachTerminal({ id, cwd: initialCwdRef.current, cols, rows })
      .then((res) => {
        // `cancelled` means cleanup already ran, and cleanup is this view's only
        // detach caller. Detaching again here would land after the replacement
        // view's attach and leave the session running but muted — StrictMode's
        // mount/unmount/mount makes that the common case, not a rare race.
        if (cancelled) return;
        if (!res.success) {
          reportStartFailure(res.error ?? 'unknown error');
          return;
        }

        const { session, scrollback } = res.data;
        term.write(scrollback);
        applySessionSnapshot(session);
        if (session.status === 'exited') {
          term.write(`\r\n\x1b[2m[process exited with code ${session.exitCode ?? 0}]\x1b[0m\r\n`);
        } else {
          term.focus();
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        reportStartFailure(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      unsubscribe();
      inputDisposable.dispose();
      void detachTerminal(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, setTerminalStatus, applySessionSnapshot]);

  // Refit and resize PTY when the container changes size or visibility toggles.
  useEffect(() => {
    if (!containerRef.current) return;
    const target = containerRef.current;

    const refit = () => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      // Skip when the container is collapsed (display:none on hidden tabs).
      // Fitting a zero-sized container drives cols/rows to a minimum and tells
      // the PTY to wrap at that width, corrupting the buffer with vertical text.
      if (target.offsetWidth === 0 || target.offsetHeight === 0) return;
      try {
        fit.fit();
        void resizeTerminal(id, term.cols, term.rows);
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
    const target = containerRef.current;
    if (!term || !fit || !target) return;
    requestAnimationFrame(() => {
      try {
        if (target.offsetWidth === 0 || target.offsetHeight === 0) return;
        fit.fit();
        void resizeTerminal(id, term.cols, term.rows);
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
