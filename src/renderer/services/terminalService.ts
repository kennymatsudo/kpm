export interface TerminalCreateParams {
  id: string;
  cwd?: string;
  cols: number;
  rows: number;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

interface IpcResponse {
  success: boolean;
  error?: string;
}

export function createTerminal(params: TerminalCreateParams): Promise<IpcResponse> {
  return window.api.terminal.create(params);
}

export function writeToTerminal(id: string, data: string): Promise<IpcResponse> {
  return window.api.terminal.write(id, data);
}

export function resizeTerminal(id: string, cols: number, rows: number): Promise<IpcResponse> {
  return window.api.terminal.resize(id, cols, rows);
}

export function killTerminal(id: string): Promise<IpcResponse> {
  return window.api.terminal.kill(id);
}

export function onTerminalData(callback: (event: TerminalDataEvent) => void): () => void {
  return window.api.terminal.onData(callback);
}

export function onTerminalExit(callback: (event: TerminalExitEvent) => void): () => void {
  return window.api.terminal.onExit(callback);
}
