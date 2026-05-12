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
  terminalService.on('data', (id: string, chunk: string) => {
  });

  terminalService.on('exit', (id: string, exitCode: number, signal?: number) => {
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
