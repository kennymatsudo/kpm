/**
 * Repo access + plan modification guidance.
 *
 * Modern Claude doesn't need a mode taxonomy (EXPLORE/ANALYZE/ADVISE/CHAT)
 * — it reads intent from the prompt. We only encode KPM-specific operational
 * facts the model can't infer: repo scope limits, scan-before-modify, and
 * `code_refs` requirements. The flat-by-default structure rule lives in
 * PLAN_SYSTEM_RULES and source-of-truth validation in GROUNDING (both in
 * workspace.ts) — stated once there, not restated here. Focused-resource
 * guidance travels per-message (injected into the user turn) rather than
 * living here.
 */

import type { PlanItem } from '../../../shared/types';

function buildRepoAccessSection(hasRepos: boolean): string {
  if (!hasRepos) return '';

  return `## Repo Access

Connected repos are read-only. Explore when the request depends on implementation details; skip only for generic questions with no project-specific component. When the user has focused repos or files (see per-message context), explore them freely.

Read/Grep/Glob reach any folder on disk — the project, connected repos, or any other path the user points you to. If a path doesn't exist or you can't access it, say so. Writes stay scoped: connected repos are read-only, and changes outside the project folder need the user's approval.`;
}

/**
 * Plan modification guidance — the exploration prep specific to editing the
 * plan (scan-before-modify, `code_refs`). The structural rules (flat-by-default,
 * nesting, Groups) live in PLAN_SYSTEM_RULES so they're stated once, not twice.
 */
function buildPlanModificationsSection(): string {
  return `## Plan Modifications

When asked to break down, create, or reorganize work:

- If the request depends on current implementation, scan targeted files before \`modify_plan\`. When repos or files are focused (see per-message context), explore them first.
- Include \`code_refs\` whenever you have relevant file paths.

For nesting, flat-by-default, and Groups, follow **Plan Structure**.`;
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
  _planItems: PlanItem[],
  _getPromptContent?: (key: string) => string
): string {
  const repoAccess = buildRepoAccessSection(hasRepos);
  const planMods = buildPlanModificationsSection();

  return repoAccess ? `${repoAccess}\n\n${planMods}` : planMods;
}
