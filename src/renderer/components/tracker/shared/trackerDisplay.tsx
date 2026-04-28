
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

export function trackerProjectEntityFor(trackerType: string | null | undefined): string {
  const normalized = normalizeTrackerType(trackerType);
  if (normalized === 'linear') return 'team';
  if (normalized === 'jira') return 'project';
  return 'Tracker';
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
