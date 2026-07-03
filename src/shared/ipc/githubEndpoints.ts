/**
 * GitHub (PR management) domain endpoint registry.
 *
 * One entry per `github:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.github`.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';

export const githubEndpoints = {
  checkAuth: { channel: 'github:check-auth', params: z.object({ sessionId: uuid }) },
  createPr: {
    channel: 'github:create-pr',
    params: z.object({
      sessionId: uuid,
      title: z.string().min(1, 'Title is required').max(256),
      body: z.string().max(65536),
      draft: z.boolean().optional(),
    }),
  },
  getPrStatus: { channel: 'github:get-pr-status', params: z.object({ sessionId: uuid }) },
  getPrComments: { channel: 'github:get-pr-comments', params: z.object({ sessionId: uuid }) },
  buildPrContext: { channel: 'github:build-pr-context', params: z.object({ sessionId: uuid }) },
  generatePrContent: {
    channel: 'github:generate-pr-content',
    params: z.object({
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
  },
  buildAddressCommentsContext: { channel: 'github:build-address-comments-context', params: z.object({ sessionId: uuid }) },
  detectAndLinkPr: { channel: 'github:detect-and-link-pr', params: z.object({ sessionId: uuid }) },
  linkPr: {
    channel: 'github:link-pr',
    params: z.object({ sessionId: uuid, prIdentifier: z.string().min(1, 'PR identifier is required').max(512) }),
  },
  linkPrToItem: {
    channel: 'github:link-pr-to-item',
    params: z.object({
      planItemId: uuid,
      repoId: uuid,
      prIdentifier: z.string().min(1, 'PR identifier is required').max(512),
    }),
  },
} satisfies Record<string, EndpointDefinition>;

export type GitHubEndpoints = typeof githubEndpoints;
export type GitHubEndpointName = keyof GitHubEndpoints;
