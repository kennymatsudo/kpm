import { ipcMain, type BrowserWindow } from 'electron';
import { terminalEndpoints, type TerminalEndpointName } from '../../../shared/ipc/terminalEndpoints';
import type { EndpointPayload } from '../../../shared/ipc/endpoints';
import { IPC_CHANNELS } from '../channels';
import { toIpcResponse } from '../response';
import type { TerminalService } from '../../services/streaming/TerminalService';

type TerminalHandler<K extends TerminalEndpointName> = (
  params: EndpointPayload<(typeof terminalEndpoints)[K]>
) => unknown;

/**
 * One handler per `terminalEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type TerminalHandlers = { [K in TerminalEndpointName]: TerminalHandler<K> };

function buildTerminalHandlers(terminalService: TerminalService): TerminalHandlers {
  return {
    create: (input) => toIpcResponse(terminalService.create(input)),
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
    win.webContents.send(IPC_CHANNELS.terminal.data, { id, data: chunk });
  });

  terminalService.on('exit', (id: string, exitCode: number, signal?: number) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.terminal.exit, { id, exitCode, signal });
  });

  const handlers = buildTerminalHandlers(terminalService);

  for (const [name, { channel, params }] of Object.entries(terminalEndpoints) as [
    TerminalEndpointName,
    (typeof terminalEndpoints)[TerminalEndpointName],
  ][]) {
    // Each handler's parameter type was checked once against its own
    // registry entry in `buildTerminalHandlers`; iterating erases that
    // per-key correlation into a union, hence the cast here.
    const handler = handlers[name] as (params: unknown) => unknown;
    ipcMain.handle(channel, (_event, rawParams: unknown) => {
      const parsedParams = params ? params.parse(rawParams) : undefined;
      return handler(parsedParams);
    });
  }
}
