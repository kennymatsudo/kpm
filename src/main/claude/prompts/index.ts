/**
 * System prompt construction for Claude integration.
 *
 */

// Re-export types
export type { PlanContext } from './types';

import { FULL_HIERARCHY_THRESHOLD, buildItemReferenceTable } from './planFormatting';
import { buildResponseModesSection } from './modes';

/**
 */
export function buildSystemPrompt(context: PlanContext): string {

  const hasAttachments = attachments.length > 0;
  const hasRepos = repos.length > 0;
  const hasPlan = planItems.length > 0;


Phase: ${project.phase}



${hasAttachments ? buildAttachmentsSection(attachments) : ''}



}
