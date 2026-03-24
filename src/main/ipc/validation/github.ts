/**
 * GitHub IPC Validation Schemas
 */

import { z } from 'zod';

export const GitHubSchemas = {
  checkAuth: z.object({
    sessionId: uuid,
  }),

  createPr: z.object({
    sessionId: uuid,
    title: z.string().min(1, 'Title is required').max(256),
    body: z.string().max(65536),
    draft: z.boolean().optional(),
  }),

  getPrStatus: z.object({
    sessionId: uuid,
  }),

  getPrComments: z.object({
    sessionId: uuid,
  }),

  buildPrContext: z.object({
    sessionId: uuid,
  }),

  buildAddressCommentsContext: z.object({
    sessionId: uuid,
  }),
};
