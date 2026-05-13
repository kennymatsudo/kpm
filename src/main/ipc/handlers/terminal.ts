import { ipcMain, type BrowserWindow } from 'electron';
import { TerminalSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import { toIpcResponse } from '../response';
import type { TerminalService } from '../../services/streaming/TerminalService';

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

  ipcMain.handle(IPC_CHANNELS.terminal.create, (_event, params: unknown) => {
    const input = TerminalSchemas.create.parse(params);
    return toIpcResponse(terminalService.create(input));
  });

  ipcMain.handle(IPC_CHANNELS.terminal.write, (_event, params: unknown) => {
    const { id, data } = TerminalSchemas.write.parse(params);
    return toIpcResponse(terminalService.write(id, data));
  });

  ipcMain.handle(IPC_CHANNELS.terminal.resize, (_event, params: unknown) => {
    const { id, cols, rows } = TerminalSchemas.resize.parse(params);
    return toIpcResponse(terminalService.resize(id, cols, rows));
  });

  ipcMain.handle(IPC_CHANNELS.terminal.kill, (_event, params: unknown) => {
    const { id } = TerminalSchemas.kill.parse(params);
    return toIpcResponse(terminalService.kill(id));
  });
}
