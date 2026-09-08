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
import { canResizeTerminal } from './terminalDimensions';
import { createRefitScheduler } from './refitScheduler';

interface TerminalInstanceProps {
  id: string;
  projectId: string;
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

const REFIT_DEBOUNCE_MS = 100;
const REFIT_RETRY_MS = 250;
const MAX_REFIT_RETRIES = 20;

/** True when the container is on screen with a real box, so a fit can succeed. */
function isMeasurable(target: HTMLElement): boolean {
  return target.isConnected && target.offsetParent !== null && target.clientWidth > 0;
}

/** Reflow the terminal and keep the PTY's dimensions in sync when it is visible. */
function fitAndResizeTerminal(id: string, fit: FitAddon): boolean {
  try {
    const dimensions = fit.proposeDimensions();
    if (!canResizeTerminal(dimensions, document.visibilityState === 'visible')) return false;
    fit.fit();
    void resizeTerminal(id, dimensions.cols, dimensions.rows);
    return true;
  } catch {
    // The container may not be sized yet; a later resize will try again.
    return false;
  }
}

export function TerminalInstance({ id, projectId, cwd, hidden }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const scheduleRefitRef = useRef<(() => void) | null>(null);
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
      if (canResizeTerminal(fit.proposeDimensions(), document.visibilityState === 'visible')) {
        fit.fit();
      }
    } catch {
      // container may not be sized yet; resize observer will handle it
    }
    const { cols, rows } = term;

    let cancelled = false;
    // Live output can beat the attach response across the IPC boundary: main
    // starts emitting the moment it has read the scrollback snapshot, but that
    // snapshot still has to make the trip back. Writing those chunks straight
    // through puts them *ahead* of the older scrollback that lands a moment
    // later, so hold them until the replay is done.
    let queuedChunks: string[] | null = [];
    const writeToView = (chunk: string) => {
      if (queuedChunks) queuedChunks.push(chunk);
      else term.write(chunk);
    };
    const flushQueuedChunks = () => {
      const queued = queuedChunks;
      queuedChunks = null;
      queued?.forEach((chunk) => term.write(chunk));
    };

    const unsubscribe = subscribeToTerminal(id, {
      onData: writeToView,
      onExit: (exitCode) => {
        setTerminalStatus(id, 'exited', exitCode);
        writeToView(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
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
      flushQueuedChunks();
      term.write(`\r\n\x1b[31m[terminal] failed to start: ${reason}\x1b[0m\r\n`);
      setTerminalStatus(id, 'exited', 1);
    };

    void attachTerminal({ id, projectId, cwd: initialCwdRef.current, cols, rows })
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
        flushQueuedChunks();
        applySessionSnapshot(session);
        if (session.status === 'exited') {
          term.write(`\r\n\x1b[2m[process exited with code ${session.exitCode ?? 0}]\x1b[0m\r\n`);
        } else {
          term.focus();
        }
        // The inline fit above can run before xterm has measured the font, in
        // which case the shell just spawned at xterm's 80x24 default. Now that
        // main knows the id, a corrective resize will land.
        scheduleRefitRef.current?.();
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
    // `projectId` is part of the entry's identity and never changes for a
    // given id, so it can't cause a spurious teardown.
  }, [id, projectId, setTerminalStatus, applySessionSnapshot]);

  // Refit and resize PTY when the container or document becomes usable again.
  useEffect(() => {
    if (!containerRef.current) return;
    const target = containerRef.current;

    const scheduler = createRefitScheduler({
      attempt: () => {
        const fit = fitRef.current;
        return fit ? fitAndResizeTerminal(id, fit) : false;
      },
      canRetry: () => isMeasurable(target),
      debounceMs: REFIT_DEBOUNCE_MS,
      retryMs: REFIT_RETRY_MS,
      maxRetries: MAX_REFIT_RETRIES,
    });
    scheduleRefitRef.current = scheduler.schedule;

    const ro = new ResizeObserver(scheduler.schedule);
    ro.observe(target);
    document.addEventListener('visibilitychange', scheduler.schedule);
    return () => {
      scheduler.cancel();
      scheduleRefitRef.current = null;
      ro.disconnect();
      document.removeEventListener('visibilitychange', scheduler.schedule);
    };
  }, [id]);

  // When this tab becomes visible, focus and refit (offscreen xterms can't measure).
  useEffect(() => {
    if (hidden) return;
    const term = termRef.current;
    if (!term) return;
    scheduleRefitRef.current?.();
    term.focus();
  }, [hidden, id]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full px-2 pt-1"
      style={{ display: hidden ? 'none' : 'block' }}
    />
  );
}
