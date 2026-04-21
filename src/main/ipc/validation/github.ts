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

  generatePrContent: z.object({
    sessionId: uuid,
    rawTitle: z.string(),
    rawBody: z.string(),
    prTemplate: z.string().nullable(),
    diff: z.string(),
    commitLog: z.string(),
  }),

  buildAddressCommentsContext: z.object({
    sessionId: uuid,
  }),

  detectAndLinkPr: z.object({
    sessionId: uuid,
  }),

  linkPr: z.object({
    sessionId: uuid,
    prIdentifier: z.string().min(1, 'PR identifier is required').max(512),
  }),

  linkPrToItem: z.object({
    planItemId: uuid,
    repoId: uuid,
    prIdentifier: z.string().min(1, 'PR identifier is required').max(512),
  }),
};
