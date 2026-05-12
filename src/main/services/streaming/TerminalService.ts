/**
 * TerminalService - PTY lifecycle for the embedded developer terminal panel.
 *
 * Distinct from CliAgentSession: this is a generic user-driven shell, not an
 * agent harness. No hook wiring, no activity mapping — raw bytes in, raw bytes
 * out. The renderer hosts the xterm.js instance and bridges via IPC.
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { homedir, platform } from 'os';
import { statSync } from 'fs';
import { getCleanEnv } from './envUtils';
import { type ServiceResult, success, failure } from '../result';

const LOG_PREFIX = '[TerminalService]';

/** Max output buffer per session (1MB) — matches CliAgentSession. */
const MAX_OUTPUT_BUFFER = 1024 * 1024;

export interface CreateTerminalOptions {
  id: string;
  cwd?: string;
  cols: number;
  rows: number;
  /** Override shell. Defaults to $SHELL on unix, cmd.exe on win32. */
  shell?: string;
  /** Extra env merged over the cleaned process env. */
  env?: Record<string, string>;
}

interface TerminalEntry {
  process: pty.IPty;
  buffer: string;
}

export class TerminalService extends EventEmitter {
  private terminals = new Map<string, TerminalEntry>();

  create(opts: CreateTerminalOptions): ServiceResult<void> {
    if (this.terminals.has(opts.id)) {
      return failure(`Terminal ${opts.id} already exists`);
    }

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

    const entry: TerminalEntry = { process: proc, buffer: '' };
    this.terminals.set(opts.id, entry);

    proc.onData((chunk) => {
      entry.buffer += chunk;
      if (entry.buffer.length > MAX_OUTPUT_BUFFER) {
        entry.buffer = entry.buffer.slice(-MAX_OUTPUT_BUFFER);
      }
      this.emit('data', opts.id, chunk);
    });

    proc.onExit(({ exitCode, signal }) => {
      this.terminals.delete(opts.id);
      this.emit('exit', opts.id, exitCode, signal);
    });

    return success(undefined);
  }

  write(id: string, data: string): ServiceResult<void> {
    const entry = this.terminals.get(id);
    if (!entry) return failure(`Terminal ${id} not found`);
    try {
      entry.process.write(data);
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  resize(id: string, cols: number, rows: number): ServiceResult<void> {
    const entry = this.terminals.get(id);
    if (!entry) return failure(`Terminal ${id} not found`);
    try {
      entry.process.resize(Math.max(1, cols), Math.max(1, rows));
      return success(undefined);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  }

  kill(id: string): ServiceResult<void> {
    const entry = this.terminals.get(id);
    if (!entry) return success(undefined);
    try {
      entry.process.kill();
    } catch {
      // Process may already be dead
    }
    this.terminals.delete(id);
    return success(undefined);
  }

  /** Kill every active PTY. Called from AppLifecycleService on shutdown. */
  shutdown(): void {
    for (const entry of this.terminals.values()) {
      try {
        entry.process.kill();
      } catch {
        // best-effort
      }
    }
    this.terminals.clear();
  }

  /** Test/debug introspection. */
  has(id: string): boolean {
    return this.terminals.has(id);
  }

  /** Test/debug introspection — returns the accumulated buffer for a session. */
  getBuffer(id: string): string | undefined {
    return this.terminals.get(id)?.buffer;
  }

  /** Number of live terminals. */
  size(): number {
    return this.terminals.size;
  }
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
