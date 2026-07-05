/**
 * Slack triage domain endpoint registry.
 *
 * One entry per `slack:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.slack`. Slack has no progress/badge broadcast events —
 * `slack.triage.countPending` is polled via invoke, not pushed — so every
 * channel is an invoke endpoint and belongs in this registry.
 */

import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';
import type { McpServerSource, SlackChannelLink, SlackTriageItem } from '../types';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

/** Mirrors `SlackMcpAvailability` from `main/services/core/McpDiscoveryService.ts`. */
interface SlackMcpAvailability {
  available: boolean;
  source: McpServerSource | null;
  serverName: string | null;
  reason: string | null;
}

/** Mirrors `FilterBreakdown` from `main/services/core/SlackTriageService.ts`. */
interface FilterBreakdown {
  bot_message: number;
  already_triaged: number;
  structural: number;
}

/** Mirrors `TriageResult` from `main/services/core/SlackTriageService.ts`. */
interface TriageResult {
  newItems: SlackTriageItem[];
  messagesRead: number;
  messagesProcessed: number;
  messagesFiltered: number;
  filterBreakdown: FilterBreakdown;
}

/** `{success: boolean; error?: string}` shape returned by `toIpcResponse`. */
interface SuccessOrError {
  success: boolean;
  error?: string;
}

export const slackEndpoints = {
  // `.optional()`: the renderer has always invoked this with no payload, and
  // a bare `z.object({}).parse(undefined)` throws — the old schema made every
  // call reject at validation before reaching the handler.
  'availability.get': {
    channel: 'slack:availability:get',
    params: z.object({}).optional(),
    result: resultOf<SlackMcpAvailability>(),
  },

  'links.list': {
    channel: 'slack:links:list',
    params: z.object({ projectId: uuid }),
    result: resultOf<SlackChannelLink[]>(),
  },
  'links.create': {
    channel: 'slack:links:create',
    params: z.object({
      projectId: uuid,
      channelId: nonEmptyString('Channel ID'),
      channelName: nonEmptyString('Channel name'),
    }),
    result: resultOf<SlackChannelLink>(),
  },
  'links.delete': {
    channel: 'slack:links:delete',
    params: z.object({ linkId: uuid }),
    result: resultOf<SuccessOrError>(),
  },

  'triage.trigger': {
    channel: 'slack:triage:trigger',
    params: z.object({ projectId: uuid, channelLinkId: uuid }),
    result: resultOf<TriageResult>(),
  },
  'triage.getPending': {
    channel: 'slack:triage:get-pending',
    params: z.object({ projectId: uuid }),
    result: resultOf<SlackTriageItem[]>(),
  },
  'triage.getAll': {
    channel: 'slack:triage:get-all',
    params: z.object({ projectId: uuid }),
    result: resultOf<SlackTriageItem[]>(),
  },
  'triage.countPending': {
    channel: 'slack:triage:count-pending',
    params: z.object({ projectId: uuid }),
    result: resultOf<number>(),
  },
  'triage.approve': {
    channel: 'slack:triage:approve',
    params: z.object({ itemId: uuid }),
    result: resultOf<SuccessOrError>(),
  },
  'triage.edit': {
    channel: 'slack:triage:edit',
    params: z.object({ itemId: uuid, suggestedAction: z.unknown() }),
    result: resultOf<SuccessOrError>(),
  },
  'triage.dismiss': {
    channel: 'slack:triage:dismiss',
    params: z.object({ itemId: uuid }),
    result: resultOf<SuccessOrError>(),
  },
  'triage.restore': {
    channel: 'slack:triage:restore',
    params: z.object({ itemId: uuid }),
    result: resultOf<SuccessOrError>(),
  },
  'triage.execute': {
    channel: 'slack:triage:execute',
    params: z.object({ itemId: uuid }),
    result: resultOf<SuccessOrError>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type SlackEndpoints = typeof slackEndpoints;
export type SlackEndpointName = keyof SlackEndpoints;
