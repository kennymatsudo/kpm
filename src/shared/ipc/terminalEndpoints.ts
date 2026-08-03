/**
 * Terminal domain endpoint registry — embedded developer terminal panel.
 *
 * The main process owns a terminal session: its id, resolved cwd, status, exit
 * code, and scrollback. The renderer owns a view that attaches to a session id
 * and holds no session state of its own — so a session outlives its view, and
 * re-attaching replays the scrollback instead of spawning a second shell.
 *
 * `terminal:data` and `terminal:exit` are PTY output/exit events
 * (`webContents.send` / `ipcRenderer.on`), not invoke endpoints — see
 * `terminalEvents.ts`. Main only emits them for an attached session; a detached
 * session keeps buffering, which is what makes the replay on re-attach gapless.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';

const terminalId = z.string().min(1, 'terminalId cannot be empty').trim().max(128);
const dimension = z.number().int().min(1).max(1000);

export type TerminalSessionStatus = 'running' | 'exited';

export interface TerminalSessionSnapshot {
  id: string;
  /** Absolute cwd the shell was actually spawned in, after resolution. */
  cwd: string;
  status: TerminalSessionStatus;
  exitCode?: number;
}

export interface TerminalAttachment {
  session: TerminalSessionSnapshot;
  /** Everything the shell has written so far, capped at the session buffer size. */
  scrollback: string;
}

/** `IpcResponse<T>` shape returned by `toIpcResponse` — mirrors `main/ipc/response.ts`. */
type IpcResult<T> = { success: true; data: T } | { success: false; error: string };

export const terminalEndpoints = {
  list: {
    channel: 'terminal:list',
    params: null,
    result: resultOf<IpcResult<TerminalSessionSnapshot[]>>(),
  },
  /**
   * Attach a view to a session, creating the session if this is its first view.
   * `cwd`, `cols`, and `rows` describe how to spawn the shell and are ignored
   * when the session already exists.
   */
  attach: {
    channel: 'terminal:attach',
    params: z.object({
      id: terminalId,
      cwd: z.string().optional(),
      cols: dimension,
      rows: dimension,
    }),
    result: resultOf<IpcResult<TerminalAttachment>>(),
  },
  /** Stop delivering output to the view. The session keeps running and buffering. */
  detach: {
    channel: 'terminal:detach',
    params: z.object({ id: terminalId }),
    result: resultOf<IpcResult<void>>(),
  },
  write: {
    channel: 'terminal:write',
    params: z.object({ id: terminalId, data: z.string() }),
    result: resultOf<IpcResult<void>>(),
  },
  resize: {
    channel: 'terminal:resize',
    params: z.object({ id: terminalId, cols: dimension, rows: dimension }),
    result: resultOf<IpcResult<void>>(),
  },
  /** End the session and forget it. The only thing that kills a shell. */
  kill: {
    channel: 'terminal:kill',
    params: z.object({ id: terminalId }),
    result: resultOf<IpcResult<void>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type TerminalEndpoints = typeof terminalEndpoints;
export type TerminalEndpointName = keyof TerminalEndpoints;
