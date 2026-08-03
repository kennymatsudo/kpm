import type { BrowserWindow } from 'electron';
import { terminalEndpoints, type TerminalEndpointName } from '../../../shared/ipc/terminalEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import { toIpcResponse } from '../response';
import { bindRegistryHandlers } from '../validation/utils';
import { success } from '../../services/result';
import type { TerminalService } from '../../services/streaming/TerminalService';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { terminalEvents } from '../../../shared/ipc/terminalEvents';

/**
 * One handler per `terminalEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type TerminalHandlers = { [K in TerminalEndpointName]: HandlerFor<typeof terminalEndpoints, K> };

function buildTerminalHandlers(terminalService: TerminalService): TerminalHandlers {
  return {
    list: () => toIpcResponse(success(terminalService.list())),
    attach: (input) => toIpcResponse(terminalService.attach(input)),
    detach: ({ id }) => toIpcResponse(terminalService.detach(id)),
    write: ({ id, data }) => toIpcResponse(terminalService.write(id, data)),
    resize: ({ id, cols, rows }) => toIpcResponse(terminalService.resize(id, cols, rows)),
    kill: ({ id }) => toIpcResponse(terminalService.kill(id)),
  };
}

export function registerTerminalHandlers(
  terminalService: TerminalService,
  getMainWindow: () => BrowserWindow | null,
): void {
  // Forward PTY data/exit events to the renderer. One subscription for the
  // lifetime of the process; messages are scoped by terminal id so the
  // renderer dispatches to the right xterm instance.
  // PTY events can fire during shutdown after the window/webContents has been
  // destroyed. Accessing `.webContents` or calling `.send` on a destroyed
  // window throws "Object has been destroyed" and crashes the main process.
  terminalService.on('data', (id: string, chunk: string) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    emitAppEvent(win.webContents, terminalEvents.data, { id, data: chunk });
  });

  terminalService.on('exit', (id: string, exitCode: number, signal?: number) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    emitAppEvent(win.webContents, terminalEvents.exit, { id, exitCode, signal });
  });

  bindRegistryHandlers(terminalEndpoints, buildTerminalHandlers(terminalService));
}
