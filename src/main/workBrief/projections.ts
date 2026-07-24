import type { PlanItem } from '../../shared/types';
import type { WorkBrief } from '../../shared/workBrief';
import {
  EMPTY_EXTERNAL_MARKDOWN,
  toExternalMarkdown,
  type ExternalDestination,
  type ExternalMarkdown,
} from '../documents/exportBoundary';

export interface TrackerWorkBriefProjection {
  title: string;
  context: ExternalMarkdown | null;
}

export function projectWorkBriefToTracker(
  workBrief: WorkBrief,
  planItems: readonly PlanItem[],
  destination: ExternalDestination,
): TrackerWorkBriefProjection {
  return {
    title: workBrief.title,
    context: workBrief.context
      ? toExternalMarkdown(workBrief.context, planItems, destination)
      : null,
  };
}

export function projectWorkBriefToTrackerUpdate(
  workBrief: WorkBrief,
  planItems: readonly PlanItem[],
  destination: ExternalDestination,
): { summary: string; description: ExternalMarkdown } {
  const projected = projectWorkBriefToTracker(workBrief, planItems, destination);
  return {
    summary: projected.title,
    description: projected.context ?? EMPTY_EXTERNAL_MARKDOWN,
  };
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
  if (workBrief.context) {
    sections.push('## Context', workBrief.context);
  } else if (!workBrief.intent && workBrief.acceptance_criteria.length === 0) {
    sections.push('## Context', 'No context provided.');
  }

  return sections.join('\n\n');
}
