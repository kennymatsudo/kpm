/**
 * Terminal domain event registry (main -> renderer push events).
 *
 * Covers `terminal:data`/`terminal:exit`, forwarded from `TerminalService`'s
 * PTY output in `handlers/terminal.ts`. Not invoke endpoints — see
 * `terminalEndpoints.ts` for the invoke surface. Channels were previously
 * hand-declared inline on `IPC_CHANNELS.terminal` in `shared/ipcChannels.ts`;
 * this registry is now their single owner.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface TerminalDataEventData {
  id: string;
  data: string;
}

export interface TerminalExitEventData {
  id: string;
  exitCode: number;
  signal?: number;
}

export const terminalEvents = {
  data: { channel: 'terminal:data', payload: payloadOf<TerminalDataEventData>() },
  exit: { channel: 'terminal:exit', payload: payloadOf<TerminalExitEventData>() },
} satisfies Record<string, EventDefinition>;

export type TerminalEvents = typeof terminalEvents;
export type TerminalEventName = keyof TerminalEvents;
