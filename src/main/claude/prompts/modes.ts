/**
 * Repo access + plan modification guidance.
 *
 * Modern Claude doesn't need a mode taxonomy (EXPLORE/ANALYZE/ADVISE/CHAT)
 * — it reads intent from the prompt. We only encode KPM-specific operational
 */

import type { PlanItem } from '../../../shared/types';

  if (!hasRepos) return '';


}

/**
 */
  return `## Plan Modifications


}

/**
 * Build the response-modes section.
 *
 * The `getPromptContent` parameter is preserved for parity with `index.ts`'s
 * resolver signature but is currently unused — there are no overridable keys
 * in this section. Kept so the call site doesn't need to special-case.
 */
export function buildResponseModesSection(
  hasRepos: boolean,
  _getPromptContent?: (key: string) => string
): string {

  return repoAccess ? `${repoAccess}\n\n${planMods}` : planMods;
}
