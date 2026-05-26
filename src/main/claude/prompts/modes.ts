/**
 * Repo access + plan modification guidance.
 *
 * Modern Claude doesn't need a mode taxonomy (EXPLORE/ANALYZE/ADVISE/CHAT)
 * — it reads intent from the prompt. We only encode KPM-specific operational
 */

import type { PlanItem } from '../../../shared/types';

function buildRepoAccessSection(hasRepos: boolean): string {
  if (!hasRepos) return '';

  return `## Repo Access


}

/**
 */
function buildPlanModificationsSection(): string {
  return `## Plan Modifications

When asked to break down, create, or reorganize work:

- If the request depends on current implementation, scan targeted files before \`modify_plan\`. When repos or files are focused (see per-message context), explore them first.
- Include \`code_refs\` whenever you have relevant file paths.
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
  const repoAccess = buildRepoAccessSection(hasRepos);
  const planMods = buildPlanModificationsSection();

  return repoAccess ? `${repoAccess}\n\n${planMods}` : planMods;
}
