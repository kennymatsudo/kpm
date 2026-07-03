/**
 * Slack Triage Validation Schemas
 *
 * Payload schemas are owned by `shared/ipc/slackEndpoints.ts` (one entry per
 * IPC endpoint, shared with the preload bridge and the handler binding).
 */

import type { z } from 'zod';
import { slackEndpoints } from '../../../shared/ipc/slackEndpoints';

export const SlackSchemas = {
  availability: slackEndpoints['availability.get'].params,

  // Link management
  listLinks: slackEndpoints['links.list'].params,
  createLink: slackEndpoints['links.create'].params,
  deleteLink: slackEndpoints['links.delete'].params,

  // Triage operations
  triggerTriage: slackEndpoints['triage.trigger'].params,
  getPending: slackEndpoints['triage.getPending'].params,
  getAll: slackEndpoints['triage.getAll'].params,
  countPending: slackEndpoints['triage.countPending'].params,
  approveItem: slackEndpoints['triage.approve'].params,
  editItem: slackEndpoints['triage.edit'].params,
  dismissItem: slackEndpoints['triage.dismiss'].params,
  restoreItem: slackEndpoints['triage.restore'].params,
  executeItem: slackEndpoints['triage.execute'].params,
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
