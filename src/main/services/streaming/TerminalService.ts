/**
 * TerminalService - single owner of terminal session state for the embedded
 * developer terminal panel.
 *
 * Distinct from CliAgentSession: this is a generic user-driven shell, not an
 * agent harness. A session's id, resolved cwd, status, exit code, and
 * scrollback all live here; the renderer only attaches/detaches a view to a
 * session id and holds no session state of its own.
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { homedir, platform } from 'os';
import { statSync } from 'fs';
import { getCleanEnv } from './envUtils';
import { type ServiceResult, success, failure } from '../result';
import type { TerminalSessionStatus, TerminalSessionSnapshot, TerminalAttachment } from '../../../shared/ipc/terminalEndpoints';

const LOG_PREFIX = '[TerminalService]';

/** Max output buffer per session (1MB) — matches CliAgentSession. */
const MAX_OUTPUT_BUFFER = 1024 * 1024;

export interface AttachTerminalOptions {
  id: string;
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
  cwd: string;
  status: TerminalSessionStatus;
  exitCode?: number;
  scrollback: string;
  attached: boolean;
}

export class TerminalService extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();

  list(): TerminalSessionSnapshot[] {
    return Array.from(this.sessions.entries()).map(([id, session]) => toSnapshot(id, session));
  }

  attach(opts: AttachTerminalOptions): ServiceResult<TerminalAttachment> {
    let session = this.sessions.get(opts.id);
    if (!session) {
      const spawned = this.spawn(opts);
      if (!spawned.ok) return spawned;
      session = spawned.data;
    }

    const scrollback = session.scrollback;
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

    const session: TerminalSession = { process: proc, cwd, status: 'running', scrollback: '', attached: false };
    this.sessions.set(opts.id, session);

    proc.onData((chunk) => {
      session.scrollback += chunk;
      if (session.scrollback.length > MAX_OUTPUT_BUFFER) {
        session.scrollback = session.scrollback.slice(-MAX_OUTPUT_BUFFER);
      }
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
  return { id, cwd: session.cwd, status: session.status, exitCode: session.exitCode };
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
