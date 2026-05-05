/**
 * Pre-pass that rewrites `@plan/<uuid>` tokens in markdown to native syntax
 * for an export target. Run inside every push pipeline (Jira / Linear /
 * Confluence / GitHub) so refs never leak as literal `@plan/<uuid>` text into
 * an external system.
 *
 * Pure: takes markdown + plan items + a destination, returns new markdown.
 * Refs inside fenced code blocks are not rewritten (they would break the
 * surrounding code).
 */

import type { PlanItem } from '../../shared/types';
import { findRefs } from '../../shared/planRefs';

   * `[<title>](@plan/<uuid>)` so non-KPM readers see the title while
   * KPM itself can still detect the ref on render and resolve live.

/**
 * Replace every `@plan/<uuid>` in `markdown` with native syntax for
 * `destination`. Unknown UUIDs and items without a tracker linkage degrade to
 * the item's title (or to literal `@plan/<uuid>` if the UUID is unknown).
 */
export function resolvePlanRefs(
  markdown: string,
  planItems: readonly PlanItem[],
  destination: RefDestination,
): string {
  if (!markdown) return markdown;
  const matches = findRefs(markdown);
  if (matches.length === 0) return markdown;

  const byId = new Map<string, PlanItem>();
  for (const item of planItems) byId.set(item.id.toLowerCase(), item);

  let out = '';
  let cursor = 0;
  for (const match of matches) {
    out += markdown.slice(cursor, match.start);
    cursor = match.end;
  }
  out += markdown.slice(cursor);
  return out;
}

function renderRef(
  item: PlanItem | null,
  id: string,
  destination: RefDestination,
): string {
  if (!item) {
    // Unknown ref. Leave the literal token so reviewers see it's broken.
    return `@plan/${id}`;
  }

  const title = item.title;

  if (!item.external_key || !item.external_url) {
    return title;
  }

  switch (destination) {
    case 'jira':
    case 'confluence':
      // A bare URL on its own line auto-unfurls to a Jira smart card in both
      // Jira description / Confluence page contexts. As inline content, a
      // markdown link with the issue URL renders as a clickable smart link.
      return `[${item.external_key}](${item.external_url})`;
    case 'linear':
      // Linear renders bare URLs as inline issue chips when they match the
      // issue URL pattern; using a markdown link keeps the surrounding prose
      // readable when Linear can't resolve.
      return `[${item.external_key}](${item.external_url})`;
    case 'github':
      // GitHub's PR-body parser auto-links Jira / Linear keys via their app
      // integrations. Plain key text is the most portable form here; the
      // GitHubService injects `Closes <key>` separately for closing keywords.
      return item.external_key;
    case 'plain':
      return item.external_key;
  }
}

/**
 * Return the count of refs in `markdown` that resolve to a plan item without
 * tracker linkage. Used to surface a non-blocking warning on export.
 */
export function countUnlinkedRefs(
  markdown: string,
  planItems: readonly PlanItem[],
): number {
  if (!markdown) return 0;
  const matches = findRefs(markdown);
  if (matches.length === 0) return 0;
  const byId = new Map<string, PlanItem>();
  for (const item of planItems) byId.set(item.id.toLowerCase(), item);
  let count = 0;
  for (const match of matches) {
    const item = byId.get(match.id);
    if (item && (!item.external_key || !item.external_url)) count++;
  }
  return count;
}

/**
 * Return the resolved external keys for refs in `markdown` whose plan items
 * have tracker linkage. Used to inject `Closes <key>` lines into PR bodies.
 */
export function collectLinkedRefKeys(
  markdown: string,
  planItems: readonly PlanItem[],
): string[] {
  if (!markdown) return [];
  const matches = findRefs(markdown);
  if (matches.length === 0) return [];
  const byId = new Map<string, PlanItem>();
  for (const item of planItems) byId.set(item.id.toLowerCase(), item);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const item = byId.get(match.id);
    if (item?.external_key && !seen.has(item.external_key)) {
      seen.add(item.external_key);
      out.push(item.external_key);
    }
  }
  return out;
}
