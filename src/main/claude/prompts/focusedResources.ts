/**
 * Focused resource formatting for prompts.
 */

import type { FocusedResource, PlanItem } from '../../../shared/types';

/** Total chars across all inlined plan-item bodies (~2K tokens). */
const PLAN_ITEM_TOTAL_BUDGET = 8000;
/** Per-item ceiling so one big item can't starve the rest. */
const PLAN_ITEM_PER_ITEM_BUDGET = 2500;
/** Description excerpt length — matches the user-facing chip popover. */
const DESCRIPTION_EXCERPT_CHARS = 220;

/**
 * Format a FocusedResource as a simple reference (one-line).
 */
export function formatFocusedResource(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
      return `"${resource.title}" (plan item id: ${resource.id})`;
    case 'project_file':
      return resource.path;
    case 'repo':
      return resource.path ?? resource.id;
    case 'document':
      return resource.path;
  }
}

/**
 * Build the focused resources section for system prompts.
 *
 * For `plan_item` resources, the spec body (intent, acceptance criteria,
 * description excerpt) is inlined when the item is present in `planItems`.
 * This closes the gap where users add a plan item to context expecting the
 * model to see what the chip popover shows them — title alone wasn't enough.
 *
 * Budget: up to PLAN_ITEM_TOTAL_BUDGET chars across all plan items, with a
 * per-item ceiling. When a body is truncated or omitted, a `batch_get_items`
 * hint is emitted so the model knows how to fetch the rest.
 */
export function buildFocusedSection(
  focusedResources: FocusedResource[],
  planItems: readonly PlanItem[] = []
): string {
  if (focusedResources.length === 0) return '';

  const isSingle = focusedResources.length === 1;
  const resource = focusedResources[0];

  const hasReadableFile = focusedResources.some(
    (r) => r.type === 'project_file' || r.type === 'document'
  );
  const hasPlanItem = focusedResources.some((r) => r.type === 'plan_item');

  // Build a natural-language description of what's focused
  let focusDescription: string;
  if (isSingle) {
    focusDescription = `The user has selected ${describeFocusedResource(resource)}. When they say "this", "this file", "the file", "it", or refer to something without specifying what, they mean this resource.`;
  } else {
    focusDescription = `The user has selected the following ${focusedResources.length} resources. When they say "these", "these files", "the files", "them", or refer to something without specifying what, they mean these resources. When they say "this file" or "this" singularly, ask which one they mean — or infer from context if obvious.`;
  }

  const { blocks, truncatedPlanItemIds } = renderFocusedBlocks(focusedResources, planItems);

  const hasFocusedRepo = focusedResources.some((r) => r.type === 'repo');

  const readHint = hasReadableFile
    ? `\nUse the \`Read\` tool on the path(s) above to access file content directly — do not call \`list_project_files\` or plan query tools to find them.\n`
    : '';

  const repoHint = hasFocusedRepo
    ? `\nExplore the focused repo freely with parallel Grep/Glob/Read calls. Check \`code_refs\` on existing plan items before proposing new patterns.\n`
    : (hasReadableFile ? `\nCheck \`code_refs\` on relevant plan items before proposing new patterns.\n` : '');

  const planItemHint = hasPlanItem
    ? truncatedPlanItemIds.length > 0
      ? `\nSome focused plan items were truncated above. Use \`batch_get_items({ projectId, itemIds: [...] })\` to fetch full details (description, code_refs, dependencies) for: ${truncatedPlanItemIds.map((id) => `\`${id}\``).join(', ')}.\n`
      : `\nThe focused plan item details above are sufficient — do not call \`get_plan_item\` again unless you need code_refs or dependencies.\n`
    : '';

  return `
# Focused Selection

${focusDescription}

${blocks.join('\n\n')}
${readHint}${repoHint}${planItemHint}
Treat these as the implicit subject of the conversation unless the user explicitly names something else.
`;
}

/**
 * Render the list of focused resources with plan-item bodies inlined under a
 * shared char budget. Returns one block per resource plus the IDs of any plan
 * items whose body was truncated (or omitted because the item wasn't loaded).
 *
 * Exported separately so the block-rendering and truncation logic can be
 * unit-tested in isolation from the natural-language preamble.
 */
export function renderFocusedBlocks(
  focusedResources: readonly FocusedResource[],
  planItems: readonly PlanItem[] = []
): { blocks: string[]; truncatedPlanItemIds: string[] } {
  const planItemsById = new Map(planItems.map((p) => [p.id, p]));
  const truncatedPlanItemIds: string[] = [];
  const budget = { remaining: PLAN_ITEM_TOTAL_BUDGET };

  const blocks = focusedResources.map((r) => {
    if (r.type === 'plan_item') {
      const item = planItemsById.get(r.id);
      if (!item) {
        truncatedPlanItemIds.push(r.id);
        return `- ${formatFocusedResource(r)}`;
      }
      const block = renderPlanItemBlock(item, budget);
      if (block.truncated) truncatedPlanItemIds.push(item.id);
      return block.text;
    }
    return renderTypedResourceLine(r);
  });

  return { blocks, truncatedPlanItemIds };
}

/**
 * Render a non-plan-item focused resource as a type-annotated line so Claude
 * can identify the resource kind without calling lookup tools.
 *
 * Repos without a local path are explicitly flagged as unresolved rather than
 * presenting a bare UUID that could be mistaken for a plan-item ID and trigger
 * a spurious batch_get_items call.
 */
function renderTypedResourceLine(resource: FocusedResource): string {
  switch (resource.type) {
    case 'project_file':
      return resource.isDirectory
        ? `- Directory: ${resource.path}`
        : `- File: ${resource.path}`;
    case 'repo':
      if (resource.path) {
        return `- Repo: ${resource.path}`;
      }
      return `- Repo: [unresolved — id \`${resource.id}\` has no local path; do not attempt Read or Grep]`;
    case 'document':
      return `- Document: "${resource.title}" (path: ${resource.path})`;
    case 'plan_item':
      // Handled by the caller; included only for exhaustiveness.
      return `- ${formatFocusedResource(resource)}`;
  }
}

/**
 * Describe a focused resource in natural language for the prompt preamble.
 */
function describeFocusedResource(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
      return `a plan item: "${resource.title}"`;
    case 'project_file':
      return resource.isDirectory
        ? `a directory: ${resource.path}`
        : `a file: ${resource.path}`;
    case 'repo':
      return `a repository: ${resource.path ?? resource.id}`;
    case 'document':
      return `a document: "${resource.title}"`;
  }
}

/**
 * Render a focused plan item with its spec body, respecting a shared budget.
 * Returns the rendered text plus whether anything was truncated/omitted, so
 * the caller can emit a `batch_get_items` hint for the affected items.
 */
function renderPlanItemBlock(
  item: PlanItem,
  budget: { remaining: number }
): { text: string; truncated: boolean } {
  const lines: string[] = [];
  const headerBits: string[] = [`- Plan item \`${item.id}\` "${item.title}"`];
  if (item.external_key) headerBits.push(`[${item.external_key}]`);
  if (item.status_category) headerBits.push(`(status: ${item.status_category})`);
  lines.push(headerBits.join(' '));

  const perItemCap = Math.min(PLAN_ITEM_PER_ITEM_BUDGET, budget.remaining);
  if (perItemCap <= 0) {
    return { text: lines.join('\n'), truncated: true };
  }

  let used = 0;
  let truncated = false;

  const intent = item.intent?.trim();
  if (intent) {
    const block = `  Intent: ${intent}`;
    if (used + block.length <= perItemCap) {
      lines.push(block);
      used += block.length;
    } else {
      truncated = true;
    }
  }

  const criteria = item.acceptance_criteria ?? [];
  if (criteria.length > 0 && !truncated) {
    const header = `  Acceptance criteria:`;
    if (used + header.length <= perItemCap) {
      lines.push(header);
      used += header.length;
      let written = 0;
      for (const c of criteria) {
        const line = `    - ${c}`;
        if (used + line.length > perItemCap) {
          lines.push(`    - … ${criteria.length - written} more criteria omitted`);
          truncated = true;
          break;
        }
        lines.push(line);
        used += line.length;
        written += 1;
      }
    } else {
      truncated = true;
    }
  }

  const desc = item.description?.trim();
  if (desc && !truncated) {
    const excerpt =
      desc.length <= DESCRIPTION_EXCERPT_CHARS
        ? desc
        : desc.slice(0, DESCRIPTION_EXCERPT_CHARS).trimEnd() + '…';
    const block = `  Description: ${excerpt}`;
    if (used + block.length <= perItemCap) {
      lines.push(block);
      used += block.length;
    } else {
      truncated = true;
    }
  } else if (desc) {
    truncated = true;
  }

  budget.remaining = Math.max(0, budget.remaining - used);
  return { text: lines.join('\n'), truncated };
}
