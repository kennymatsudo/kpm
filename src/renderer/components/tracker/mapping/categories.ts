import type { StatusCategory } from '../../../../shared/types';

export interface MappableCategory {
  key: StatusCategory;
  label: string;
  description: string;
}

// Single source of truth for the mappable KPM categories shown in any
// status-mapping UI. Keep this in sync with StatusMapping in shared/types.ts.
export const MAPPABLE_KPM_CATEGORIES: readonly MappableCategory[] = [
  { key: 'not_started', label: 'Not Started', description: 'Work not yet begun' },
  { key: 'in_progress', label: 'In Progress', description: 'Actively being worked on' },
  { key: 'in_review', label: 'In Review', description: 'Awaiting code review' },
  { key: 'done', label: 'Done', description: 'Work is complete' },
  { key: 'blocked', label: 'Blocked', description: 'Work is blocked/on hold' },
  { key: 'canceled', label: 'Canceled', description: 'Work was canceled' },
];
