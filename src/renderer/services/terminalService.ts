import type { TerminalSessionStatus, TerminalSessionSnapshot, TerminalAttachment } from '../../shared/ipc/terminalEndpoints';
import type { TerminalDataEventData, TerminalExitEventData } from '../../shared/ipc/terminalEvents';

export type { TerminalSessionStatus, TerminalSessionSnapshot, TerminalAttachment };

interface TerminalSubscriptionHandlers {
  onData: (chunk: string) => void;
  onExit: (exitCode: number) => void;
}

const subscribers = new Map<string, TerminalSubscriptionHandlers>();
let unsubscribeData: (() => void) | null = null;
let unsubscribeExit: (() => void) | null = null;

function ensureSubscribed(): void {
  if (unsubscribeData) return;
  unsubscribeData = window.api.terminal.onData((event: TerminalDataEventData) => {
    subscribers.get(event.id)?.onData(event.data);
  });
  unsubscribeExit = window.api.terminal.onExit((event: TerminalExitEventData) => {
    subscribers.get(event.id)?.onExit(event.exitCode);
  });
}

export function subscribeToTerminal(id: string, handlers: TerminalSubscriptionHandlers): () => void {
  ensureSubscribed();
  subscribers.set(id, handlers);
  return () => {
    subscribers.delete(id);
    if (subscribers.size === 0) {
      unsubscribeData?.();
      unsubscribeData = null;
      unsubscribeExit?.();
      unsubscribeExit = null;
    }
  };
}

export function listTerminals() {
  return window.api.terminal.list();
}

export function attachTerminal(params: { id: string; cwd?: string; cols: number; rows: number }) {
  return window.api.terminal.attach(params);
}

export function detachTerminal(id: string) {
  return window.api.terminal.detach({ id });
}

export function writeToTerminal(id: string, data: string) {
  return window.api.terminal.write({ id, data });
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  return window.api.terminal.resize({ id, cols, rows });
}

export function killTerminal(id: string) {
  return window.api.terminal.kill({ id });
}
