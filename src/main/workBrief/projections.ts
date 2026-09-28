import type { PlanItem } from '../../shared/types';
import type { WorkBrief } from '../../shared/workBrief';
import {
  EMPTY_EXTERNAL_MARKDOWN,
  toExternalMarkdown,
  type ExternalDestination,
  type ExternalMarkdown,
} from '../documents/exportBoundary';
import { normalizeMarkdown } from '../documents/markdown';

export interface TrackerWorkBriefProjection {
  title: string;
  description: ExternalMarkdown | null;
}

export function projectWorkBriefToTracker(
  workBrief: WorkBrief,
  planItems: readonly PlanItem[],
  destination: ExternalDestination,
): TrackerWorkBriefProjection {
  return {
    title: workBrief.title,
    description: workBrief.description
      ? toExternalMarkdown(workBrief.description, planItems, destination)
      : null,
  };
}

/** What the tracker held for an item at the last sync, from its sync snapshot. */
export interface TrackerLastSynced {
  snapshot_title: string | null;
  snapshot_description: string | null;
}

/**
 * The fields a tracker update carries: only the ones that moved off the last
 * sync. Rich-text trackers reach KPM as a markdown rendering, so re-sending an
 * unchanged description replaces the tracker's own content with KPM's
 * flattened copy of it; a status-only export must not touch it. With no
 * snapshot nothing proves a field unchanged, so both are sent.
 */
export function projectWorkBriefToTrackerUpdate(
  workBrief: WorkBrief,
  planItems: readonly PlanItem[],
  destination: ExternalDestination,
  lastSynced: TrackerLastSynced | null | undefined,
): { summary?: string; description?: ExternalMarkdown } {
  const projected = projectWorkBriefToTracker(workBrief, planItems, destination);
  const update: { summary?: string; description?: ExternalMarkdown } = {};

  if (projected.title !== lastSynced?.snapshot_title) {
    update.summary = projected.title;
  }
  const syncedDescription = lastSynced ? (normalizeMarkdown(lastSynced.snapshot_description) ?? '') : undefined;
  if ((normalizeMarkdown(projected.description) ?? '') !== syncedDescription) {
    update.description = projected.description ?? EMPTY_EXTERNAL_MARKDOWN;
  }

  return update;
}

export function projectWorkBriefToExecution(workBrief: WorkBrief): string {
  const sections = [`# Task: ${workBrief.title}`];

  if (workBrief.intent) {
    sections.push('## Intent', workBrief.intent);
  }
  if (workBrief.acceptance_criteria.length > 0) {
    sections.push(
      '## Acceptance Criteria',
      workBrief.acceptance_criteria.map((criterion) => `- [ ] ${criterion}`).join('\n'),
    );
  }
  if (workBrief.description) {
    sections.push('## Context', workBrief.description);
  } else if (!workBrief.intent && workBrief.acceptance_criteria.length === 0) {
    sections.push('## Context', 'No context provided.');
  }

  return sections.join('\n\n');
}
