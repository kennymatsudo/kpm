/**
 * Pre-pass that rewrites `@plan/<uuid>` tokens in markdown to native syntax
 * for an export target, so refs never leak as literal `@plan/<uuid>` text
 * into an external system. External destinations (Jira / Linear / Confluence /
 * GitHub) go through `exportBoundary.ts`, whose branded `ExternalMarkdown`
 * return type is what tracker write payloads require; only the on-disk
 * `shared-doc` form calls this resolver directly.
 *
 * Pure: takes markdown + plan items + a destination, returns new markdown.
 * Refs inside fenced code blocks are not rewritten (they would break the
 * surrounding code).
 */

import type { PlanItem } from '../../shared/types';
import { findMarkdownLinks, findRefs, serializeRef } from '../../shared/planRefs';

export type RefDestination =
  | 'jira'
  | 'linear'
  | 'confluence'
  | 'github'
  | 'plain'
  /**
   * Persisted form for git-tracked shared docs. Emits
   * `[<title>](@plan/<uuid>)` so non-KPM readers see the title while
   * KPM itself can still detect the ref on render and resolve live.
   * Refs already wrapped in this form are skipped so re-saves stay
   * idempotent.
   */
  | 'shared-doc';

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
    if (destination === 'shared-doc' && isAlreadyInLink(markdown, match.start)) {
      // Re-save idempotency: an existing `[title](@plan/<uuid>)` already has
      // the persisted form. Leaving it untouched keeps "Plan title at time of
      // write" — re-rendering would silently update titles after they were
      // captured.
      out += markdown.slice(match.start, match.end);
    } else {
      out += renderRef(byId.get(match.id) ?? null, match.id, destination);
    }
    cursor = match.end;
  }
  out += markdown.slice(cursor);
  return out;
}

/** True when the ref starts immediately after `](`, i.e. it's the URL of a
 *  markdown link. Cheap two-char check; the resolver only uses it for the
 *  `shared-doc` destination so the cost is paid only on disk writes. */
function isAlreadyInLink(markdown: string, start: number): boolean {
  return (
    start >= 2 &&
    markdown.charCodeAt(start - 1) === 40 /* '(' */ &&
    markdown.charCodeAt(start - 2) === 93 /* ']' */
  );
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

  // Shared-doc destination uses the @plan URL as the link target, so it
  // never depends on tracker linkage being present.
  if (destination === 'shared-doc') {
    return `[${title}](@plan/${id.toLowerCase()})`;
  }

  // No tracker linkage — emit the title in every other destination.
  // Exporters can still annotate this with a non-blocking "N unlinked
  // references" warning at the call site.
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

const LINK_FORM_DESTINATIONS: ReadonlySet<RefDestination> = new Set([
  'jira',
  'linear',
  'confluence',
]);

/**
 * Inverse of `resolvePlanRefs` for the destinations that render a ref as a
 * markdown link: rewrite `[<key>](<url>)` back to `@plan/<uuid>` when the URL
 * matches a plan item's tracker link. Matching ignores the label, which is the
 * issue key on the way out but may have been retitled by whoever edited the
 * document in Jira or Linear.
 *
 * Only partially invertible, by design. A ref whose item had no tracker
 * linkage went out as bare title text that cannot be told apart from prose, so
 * it stays lost; `countUnlinkedRefs` is the pre-export check for that. The
 * `github` and `plain` forms emit a bare key for the same reason and are left
 * untouched here.
 */
export function restorePlanRefs(
  markdown: string,
  planItems: readonly PlanItem[],
  destination: RefDestination,
): string {
  if (!markdown || !LINK_FORM_DESTINATIONS.has(destination)) return markdown;
  const links = findMarkdownLinks(markdown);
  if (links.length === 0) return markdown;

  const byUrl = new Map<string, PlanItem>();
  for (const item of planItems) {
    if (item.external_url) byUrl.set(canonicalUrl(item.external_url), item);
  }
  if (byUrl.size === 0) return markdown;

  let out = '';
  let cursor = 0;
  for (const link of links) {
    const item = byUrl.get(canonicalUrl(link.target));
    if (!item) continue;
    out += markdown.slice(cursor, link.start);
    out += serializeRef(item.id);
    cursor = link.end;
  }
  out += markdown.slice(cursor);
  return out;
}

function canonicalUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
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
