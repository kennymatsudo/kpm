/**
 * TerminalService - single owner of terminal session state for the embedded
 * developer terminal panel.
 *
 * Distinct from CliAgentSession: this is a generic user-driven shell, not an
 * agent harness. A session's id, owning project, resolved cwd, status, exit
 * code, and scrollback all live here; the renderer only attaches/detaches a
 * view to a session id and holds no session state of its own.
 *
 * Sessions are tagged with the project that spawned them and `list` is
 * project-filtered. Switching projects therefore hides another project's
 * shells without killing them — they keep running and buffering, and reappear
 * when the user switches back.
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { homedir, platform } from 'os';
import { statSync } from 'fs';
import { getCleanEnv } from './envUtils';
import { createBoundedOutputBuffer, type BoundedOutputBuffer } from './outputBuffer';
import { type ServiceResult, success, failure } from '../result';
import type { TerminalSessionStatus, TerminalSessionSnapshot, TerminalAttachment } from '../../../shared/ipc/terminalEndpoints';

const LOG_PREFIX = '[TerminalService]';

/** Max output buffer per session (1MB) — matches CliAgentSession. */
const MAX_OUTPUT_BUFFER = 1024 * 1024;

export interface AttachTerminalOptions {
  id: string;
  /** Owning project. Ignored if the session already exists. */
  projectId: string;
  cwd?: string;
  cols: number;
  rows: number;
  /** Override shell. Defaults to $SHELL on unix, cmd.exe on win32. Ignored if the session already exists. */
  shell?: string;
  /** Extra env merged over the cleaned process env. Ignored if the session already exists. */
  env?: Record<string, string>;
}

interface TerminalSession {
  process: pty.IPty;
  projectId: string;
  cwd: string;
  status: TerminalSessionStatus;
  exitCode?: number;
  scrollback: BoundedOutputBuffer;
  attached: boolean;
}

export class TerminalService extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();

  list(projectId: string): TerminalSessionSnapshot[] {
    return Array.from(this.sessions.entries())
      .filter(([, session]) => session.projectId === projectId)
      .map(([id, session]) => toSnapshot(id, session));
  }

  /** Live session counts keyed by project, for the cross-project activity snapshot. */
  runningCountsByProject(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const session of this.sessions.values()) {
      if (session.status !== 'running') continue;
      counts.set(session.projectId, (counts.get(session.projectId) ?? 0) + 1);
    }
    return counts;
  }

  attach(opts: AttachTerminalOptions): ServiceResult<TerminalAttachment> {
    let session = this.sessions.get(opts.id);
    if (!session) {
      const spawned = this.spawn(opts);
      if (!spawned.ok) return spawned;
      session = spawned.data;
    } else if (session.status === 'running') {
      // The replacement view is rarely the same size as the one that spawned
      // the shell — a reopened panel, a different window. Resizing here rather
      // than waiting for the view's first resize keeps a TUI from redrawing at
      // a width the view doesn't have. Do it before reading the scrollback so
      // the redraw it provokes either lands in the snapshot or arrives after it.
      try {
        session.process.resize(Math.max(1, opts.cols), Math.max(1, opts.rows));
      } catch {
        // Shell died between the status check and here; onExit settles it.
      }
    }

    const scrollback = session.scrollback.read();
    session.attached = true;

    return success({ session: toSnapshot(opts.id, session), scrollback });
  }

  detach(id: string): ServiceResult<void> {
    const session = this.sessions.get(id);
    if (!session) return failure(`Terminal ${id} not found`);
    session.attached = false;
    return success(undefined);
  }

  write(id: string, data: string): ServiceResult<void> {
    const session = this.sessions.get(id);
    if (!session) return failure(`Terminal ${id} not found`);
    if (session.status === 'exited') return failure(`Terminal ${id} has exited`);
    try {
      session.process.write(data);
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  resize(id: string, cols: number, rows: number): ServiceResult<void> {
    const session = this.sessions.get(id);
    if (!session) return failure(`Terminal ${id} not found`);
    if (session.status === 'exited') return failure(`Terminal ${id} has exited`);
    try {
      session.process.resize(Math.max(1, cols), Math.max(1, rows));
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  kill(id: string): ServiceResult<void> {
    const session = this.sessions.get(id);
    if (!session) return failure(`Terminal ${id} not found`);
    if (session.status === 'running') {
      try {
        session.process.kill();
      } catch {
        // Process may already be dead
      }
    }
    this.sessions.delete(id);
    return success(undefined);
  }

  /** Kill every session for one project. Called when the project is deleted. */
  killForProject(projectId: string): ServiceResult<void> {
    for (const [id, session] of this.sessions) {
      if (session.projectId !== projectId) continue;
      if (session.status === 'running') {
        try {
          session.process.kill();
        } catch {
          // Process may already be dead
        }
      }
      this.sessions.delete(id);
    }
    return success(undefined);
  }

  /** Kill every active PTY. Called from AppLifecycleService on shutdown. */
  shutdown(): void {
    for (const session of this.sessions.values()) {
      if (session.status !== 'running') continue;
      try {
        session.process.kill();
      } catch {
        // best-effort
      }
    }
    this.sessions.clear();
  }

  private spawn(opts: AttachTerminalOptions): ServiceResult<TerminalSession> {
    const cwd = resolveCwd(opts.cwd);
    const shell = opts.shell ?? defaultShell();
    const env = { ...getCleanEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor', ...opts.env };

    let proc: pty.IPty;
    try {
      proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: Math.max(1, opts.cols),
        rows: Math.max(1, opts.rows),
        cwd,
        env,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${LOG_PREFIX} spawn failed:`, msg);
      return failure(`Failed to spawn shell: ${msg}`);
    }

    const session: TerminalSession = {
      process: proc,
      projectId: opts.projectId,
      cwd,
      status: 'running',
      scrollback: createBoundedOutputBuffer(MAX_OUTPUT_BUFFER),
      attached: false,
    };
    this.sessions.set(opts.id, session);

    proc.onData((chunk) => {
      session.scrollback.append(chunk);
      if (session.attached) this.emit('data', opts.id, chunk);
    });

    proc.onExit(({ exitCode, signal }) => {
      session.status = 'exited';
      session.exitCode = exitCode;
      if (session.attached) this.emit('exit', opts.id, exitCode, signal);
    });

    return success(session);
  }
}

function toSnapshot(id: string, session: TerminalSession): TerminalSessionSnapshot {
  return { id, projectId: session.projectId, cwd: session.cwd, status: session.status, exitCode: session.exitCode };
}

function defaultShell(): string {
  if (platform() === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}

function resolveCwd(cwd?: string): string {
  if (!cwd) return homedir();
  try {
    return statSync(cwd).isDirectory() ? cwd : homedir();
  } catch {
    return homedir();
  }
}

export function createTerminalService(): TerminalService {
  return new TerminalService();
}
