import type { TrackerType, StatusCategory } from '../../shared/types';

// Default status mappings per tracker type
// These can be made configurable in the future
export const STATUS_MAPPINGS: Record<TrackerType, Record<string, StatusCategory>> = {
  jira: {
    'To Do': 'not_started',
    'Backlog': 'not_started',
    'Open': 'not_started',
    'New': 'not_started',
    'In Progress': 'in_progress',
    'In Development': 'in_progress',
    'Testing': 'in_progress',
    'Done': 'done',
    'Closed': 'done',
    'Resolved': 'done',
    'Complete': 'done',
    'Blocked': 'blocked',
    'On Hold': 'blocked',
    'Waiting': 'blocked',
  },
  linear: {
    'Backlog': 'not_started',
    'Todo': 'not_started',
    'Triage': 'not_started',
    'Unstarted': 'not_started',
    'In Progress': 'in_progress',
    'Started': 'in_progress',
    'Done': 'done',
    'Completed': 'done',
    'Canceled': 'canceled',
    'Cancelled': 'canceled',
    'Duplicate': 'canceled',
  },
};

// Category styling - uses distinct hues for clear differentiation
// Each category has a unique color to avoid confusion
export const STATUS_CATEGORY_CONFIG: Record<StatusCategory, {
  label: string;
  bgClass: string;
  textClass: string;
}> = {
  not_started: {
    label: 'Not Started',
    bgClass: 'bg-surface-3',
    textClass: 'text-text-secondary',
  },
  in_progress: {
    label: 'In Progress',
    bgClass: 'bg-info-muted',
    textClass: 'text-info',
  },
  done: {
    label: 'Done',
    bgClass: 'bg-success-muted',
    textClass: 'text-success',
  },
  blocked: {
    label: 'Blocked',
    bgClass: 'bg-warning-muted',
    textClass: 'text-warning',
  },
  canceled: {
    label: 'Canceled',
    bgClass: 'bg-danger-muted',
    textClass: 'text-danger',
  },
};

/**
 * Resolve a tracker-specific status string to a normalized category.
 * Returns null if status or trackerType is missing.
 * Uses keyword-based fallback for custom/unmapped statuses.
 */
export function getStatusCategory(
  status: string | null,
  trackerType: TrackerType | null
): StatusCategory | null {
  if (!status || !trackerType) return null;

  const mappings = STATUS_MAPPINGS[trackerType];
  if (!mappings) return null;

  // Try exact match first
  if (mappings[status]) return mappings[status];

  // Try case-insensitive match
  const lowerStatus = status.toLowerCase();
  for (const [key, category] of Object.entries(mappings)) {
    if (key.toLowerCase() === lowerStatus) return category;
  }

  // Keyword-based fallback for custom/unmapped statuses
    return 'in_progress';
  }
  if (lowerStatus.includes('done') || lowerStatus.includes('complete') || lowerStatus.includes('closed') || lowerStatus.includes('resolved')) {
    return 'done';
  }
  if (lowerStatus.includes('block') || lowerStatus.includes('hold') || lowerStatus.includes('wait')) {
    return 'blocked';
  }
  if (lowerStatus.includes('cancel')) {
    return 'canceled';
  }

  // Default: assume not started for truly unknown statuses
  return 'not_started';
}
