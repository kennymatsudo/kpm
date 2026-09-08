/**
 * Plan modification guidance: the exploration prep specific to editing the
 * plan (scan-before-modify).
 *
 * Deliberately narrow. Modern Claude reads intent from the prompt, so there is
 * no mode taxonomy here — only the KPM-specific facts it can't infer.
 * Everything adjacent has an owner elsewhere and is stated once:
 * flat-by-default in PLAN_SYSTEM_RULES, source-of-truth validation and
 * when-to-explore in GROUNDING (both in workspace.ts), write consent in
 * CONSTRAINTS. Focused-resource guidance travels per-message, injected into
 * the user turn.
 */
export function buildPlanModificationsSection(): string {
  return `## Plan Modifications

When asked to break down, create, or reorganize work:

- If the request depends on current implementation, scan targeted files before \`modify_plan\`. When repos or files are focused (see per-message context), explore them first.

For nesting, flat-by-default, and Groups, follow **Plan Structure**.`;
}
