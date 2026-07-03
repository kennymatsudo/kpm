/**
 * Slack triage domain endpoint registry.
 *
 * One entry per `slack:*` IPC endpoint, keyed by the dotted method path used
 * on `window.api.slack`. Slack has no progress/badge broadcast events —
 * `slack.triage.countPending` is polled via invoke, not pushed — so every
 * channel is an invoke endpoint and belongs in this registry.
 */

import { z } from 'zod';
import type { EndpointDefinition } from './endpoints';
import { uuid } from './sharedSchemas';

const nonEmptyString = (fieldName: string) => z.string().min(1, `${fieldName} cannot be empty`).trim();

export const slackEndpoints = {
  'availability.get': { channel: 'slack:availability:get', params: z.object({}) },

  'links.list': { channel: 'slack:links:list', params: z.object({ projectId: uuid }) },
  'links.create': {
    channel: 'slack:links:create',
    params: z.object({
      projectId: uuid,
      channelId: nonEmptyString('Channel ID'),
      channelName: nonEmptyString('Channel name'),
    }),
  },
  'links.delete': { channel: 'slack:links:delete', params: z.object({ linkId: uuid }) },

  'triage.trigger': {
    channel: 'slack:triage:trigger',
    params: z.object({ projectId: uuid, channelLinkId: uuid }),
  },
  'triage.getPending': { channel: 'slack:triage:get-pending', params: z.object({ projectId: uuid }) },
  'triage.getAll': { channel: 'slack:triage:get-all', params: z.object({ projectId: uuid }) },
  'triage.countPending': { channel: 'slack:triage:count-pending', params: z.object({ projectId: uuid }) },
  'triage.approve': { channel: 'slack:triage:approve', params: z.object({ itemId: uuid }) },
  'triage.edit': {
    channel: 'slack:triage:edit',
    params: z.object({ itemId: uuid, suggestedAction: z.unknown() }),
  },
  'triage.dismiss': { channel: 'slack:triage:dismiss', params: z.object({ itemId: uuid }) },
  'triage.restore': { channel: 'slack:triage:restore', params: z.object({ itemId: uuid }) },
  'triage.execute': { channel: 'slack:triage:execute', params: z.object({ itemId: uuid }) },
} satisfies Record<string, EndpointDefinition>;

export type SlackEndpoints = typeof slackEndpoints;
export type SlackEndpointName = keyof SlackEndpoints;
