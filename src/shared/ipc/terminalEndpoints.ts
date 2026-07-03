/**
 * Terminal domain endpoint registry — embedded developer terminal panel.
 *
 * `terminal:data` and `terminal:exit` are PTY output/exit events
 * (`webContents.send` / `ipcRenderer.on`), not invoke endpoints, so they stay
 * hand-declared in `src/preload/api.ts` and `shared/ipcChannels.ts`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';

const terminalId = z.string().min(1, 'terminalId cannot be empty').trim().max(128);

export const terminalEndpoints = {
  create: {
    channel: 'terminal:create',
    params: z.object({
      id: terminalId,
      cwd: z.string().optional(),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000),
    }),
  },
  write: {
    channel: 'terminal:write',
    params: z.object({ id: terminalId, data: z.string() }),
  },
  resize: {
    channel: 'terminal:resize',
    params: z.object({ id: terminalId, cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) }),
  },
  kill: {
    channel: 'terminal:kill',
    params: z.object({ id: terminalId }),
  },
} satisfies Record<string, EndpointDefinition>;

export type TerminalEndpoints = typeof terminalEndpoints;
export type TerminalEndpointName = keyof TerminalEndpoints;
