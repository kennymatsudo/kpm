/**
 * The export boundary for markdown leaving KPM (P6: internal stays internal).
 *
 * `toExternalMarkdown` is the only way to produce `ExternalMarkdown`, so any
 * payload field typed as `ExternalMarkdown` (tracker create/update params)
 * cannot be built from unresolved markdown — forgetting to resolve
 * `@plan/<uuid>` refs is a compile error, not a silent leak.
 *
 * The `shared-doc` destination is not here on purpose: it is a persisted
 * on-disk form, not an export, and keeps calling `resolvePlanRefs` directly.
 */

import type { PlanItem } from '../../shared/types';
import { resolvePlanRefs, type RefDestination } from './planRefResolver';

declare const externalMarkdownBrand: unique symbol;

/** Markdown that has crossed the export boundary: plan refs resolved to the destination's native syntax. */
export type ExternalMarkdown = string & { readonly [externalMarkdownBrand]: true };

export type ExternalDestination = Extract<RefDestination, 'jira' | 'linear' | 'confluence' | 'github'>;

/** Contains no refs by construction; used to clear a tracker description. */
export const EMPTY_EXTERNAL_MARKDOWN = '' as ExternalMarkdown;

export function toExternalMarkdown(
  markdown: string,
  planItems: readonly PlanItem[],
  destination: ExternalDestination,
): ExternalMarkdown {
  return resolvePlanRefs(markdown, planItems, destination) as ExternalMarkdown;
}
