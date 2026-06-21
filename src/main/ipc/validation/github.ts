/**
 * GitHub IPC Validation Schemas
 */

import { z } from 'zod';
import { relativePath, uuid } from './shared';

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
    featureContextPath: relativePath
      .refine((value) => value.length > 0, 'Path cannot be empty')
      .refine((value) => /\.mdx?$/i.test(value), 'Feature context path must be markdown')
      .nullable()
      .optional(),
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
