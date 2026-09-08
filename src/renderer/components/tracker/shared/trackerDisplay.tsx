import { JiraIcon, LinearIcon } from '../../icons';

type KnownTrackerType = 'jira' | 'linear';

export function normalizeTrackerType(trackerType: string | null | undefined): KnownTrackerType | null {
  if (trackerType === 'linear') return 'linear';
  if (trackerType === 'jira') return 'jira';
  return null;
}

export function trackerLabelFor(trackerType: string | null | undefined): string {
  const normalized = normalizeTrackerType(trackerType);
  if (normalized === 'linear') return 'Linear';
  if (normalized === 'jira') return 'Jira';
  return 'Tracker';
}

export function trackerDeletionWarning(trackerType: string | null | undefined): string {
  const normalized = normalizeTrackerType(trackerType);
  if (normalized === 'linear') {
    return "will be moved to Linear's trash (recoverable for about 30 days).";
  }
  if (normalized === 'jira') {
    return 'will be permanently deleted from Jira and cannot be recovered.';
  }
  return 'will be permanently deleted from the linked tracker.';
}

export function TrackerIcon({
  trackerType,
  className,
}: {
  trackerType: string | null | undefined;
  className?: string;
}) {
  const normalized = normalizeTrackerType(trackerType);
  if (normalized === 'linear') return <LinearIcon className={className} />;
  if (normalized === 'jira') return <JiraIcon className={className} />;
  return null;
}
