/**
 * Slack Triage Validation Schemas
 *
 * Zod schemas for IPC communication with the Slack triage feature.
 */

import { z } from 'zod';
import { uuid, nonEmptyString } from './shared';

// ============================================================================
// Channel Link Schemas
// ============================================================================

export const SlackSchemas = {
  availability: z.object({}),

  // Link management
  listLinks: z.object({
    projectId: uuid,
  }),

  createLink: z.object({
    projectId: uuid,
    channelId: nonEmptyString('Channel ID'),
    channelName: nonEmptyString('Channel name'),
  }),

  deleteLink: z.object({
    linkId: uuid,
  }),

  // Triage operations
  triggerTriage: z.object({
    projectId: uuid,
    channelLinkId: uuid,
  }),

  getPending: z.object({
    projectId: uuid,
  }),

  getAll: z.object({
    projectId: uuid,
  }),

  countPending: z.object({
    projectId: uuid,
  }),

  approveItem: z.object({
    itemId: uuid,
  }),

  editItem: z.object({
    itemId: uuid,
    suggestedAction: z.unknown(),
  }),

  dismissItem: z.object({
    itemId: uuid,
  }),

  restoreItem: z.object({
    itemId: uuid,
  }),

  executeItem: z.object({
    itemId: uuid,
  }),
};

// ============================================================================
// Inferred Types
// ============================================================================

export type SlackListLinksInput = z.infer<typeof SlackSchemas.listLinks>;
export type SlackAvailabilityInput = z.infer<typeof SlackSchemas.availability>;
export type SlackCreateLinkInput = z.infer<typeof SlackSchemas.createLink>;
export type SlackDeleteLinkInput = z.infer<typeof SlackSchemas.deleteLink>;
export type SlackTriggerTriageInput = z.infer<typeof SlackSchemas.triggerTriage>;
export type SlackGetPendingInput = z.infer<typeof SlackSchemas.getPending>;
export type SlackGetAllInput = z.infer<typeof SlackSchemas.getAll>;
export type SlackCountPendingInput = z.infer<typeof SlackSchemas.countPending>;
export type SlackApproveItemInput = z.infer<typeof SlackSchemas.approveItem>;
export type SlackEditItemInput = z.infer<typeof SlackSchemas.editItem>;
export type SlackDismissItemInput = z.infer<typeof SlackSchemas.dismissItem>;
export type SlackRestoreItemInput = z.infer<typeof SlackSchemas.restoreItem>;
export type SlackExecuteItemInput = z.infer<typeof SlackSchemas.executeItem>;
