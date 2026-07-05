/**
 * GitHub (PR management) domain endpoint registry.
 *
 * One entry per `github:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.github`.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { relativePath } from './relativePath';
import { uuid } from './sharedSchemas';
import type { PrComment, PrStatus } from '../types';

/**
 * Response shape for endpoints registered through `createRegistryIpcHandlers`
 * (see `main/ipc/handlers/github.ts`): the handler returns bare data (or
 * `void`), and the registry loop wraps it as `{success: true, ...data}` /
 * `{success: false, error}`.
 */
type RegistryResponse<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

/**
 * Mirrors `GhAuthResult` from `main/services/repo/ghUtils.ts` — not
 * re-imported from there to avoid a shared/ -> main/ dependency.
 */
interface GhAuthResult {
  authenticated: boolean;
  account?: string;
}

/**
 * Mirrors `PrContextResult` from `main/services/repo/GitHubService.ts` — not
 * re-imported from there to avoid a shared/ -> main/ dependency.
 */
interface PrContextResult {
  suggestedTitle: string;
  body: string;
  branch: string | null;
  baseBranch: string;
  hasCommits: boolean;
  prTemplate: string | null;
}

export const githubEndpoints = {
  checkAuth: {
    channel: 'github:check-auth',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<GhAuthResult>>(),
  },
  createPr: {
    channel: 'github:create-pr',
    params: z.object({
      sessionId: uuid,
      title: z.string().min(1, 'Title is required').max(256),
      body: z.string().max(65536),
      draft: z.boolean().optional(),
    }),
    result: resultOf<RegistryResponse<{ number: number; url: string }>>(),
  },
  getPrStatus: {
    channel: 'github:get-pr-status',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ status: PrStatus | null }>>(),
  },
  getPrComments: {
    channel: 'github:get-pr-comments',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ comments: PrComment[] }>>(),
  },
  buildPrContext: {
    channel: 'github:build-pr-context',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<PrContextResult>>(),
  },
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
    result: resultOf<RegistryResponse<{ title: string; body: string }>>(),
  },
  buildAddressCommentsContext: {
    channel: 'github:build-address-comments-context',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ context: string }>>(),
  },
  detectAndLinkPr: {
    channel: 'github:detect-and-link-pr',
    params: z.object({ sessionId: uuid }),
    result: resultOf<RegistryResponse<{ status: PrStatus | null }>>(),
  },
  linkPr: {
    channel: 'github:link-pr',
    params: z.object({ sessionId: uuid, prIdentifier: z.string().min(1, 'PR identifier is required').max(512) }),
    result: resultOf<RegistryResponse<PrStatus>>(),
  },
  linkPrToItem: {
    channel: 'github:link-pr-to-item',
    params: z.object({
      planItemId: uuid,
      repoId: uuid,
      prIdentifier: z.string().min(1, 'PR identifier is required').max(512),
    }),
    result: resultOf<RegistryResponse<PrStatus>>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type GitHubEndpoints = typeof githubEndpoints;
export type GitHubEndpointName = keyof GitHubEndpoints;
