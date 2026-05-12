/**
 * Terminal Validation Schemas — embedded developer terminal panel.
 */

import { z } from 'zod';
import { nonEmptyString } from './shared';

const terminalId = nonEmptyString('terminalId').max(128);

export const TerminalSchemas = {
  create: z.object({
    id: terminalId,
    cwd: z.string().optional(),
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
  }),

  write: z.object({
    id: terminalId,
    data: z.string(),
  }),

  resize: z.object({
    id: terminalId,
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
  }),

  kill: z.object({
    id: terminalId,
  }),
};
