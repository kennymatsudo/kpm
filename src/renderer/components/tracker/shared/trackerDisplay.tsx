type KnownTrackerType = 'jira' | 'linear';

export function normalizeTrackerType(trackerType: string | null | undefined): KnownTrackerType | null {
export function trackerLabelFor(trackerType: string | null | undefined): string {
export function trackerProjectEntityFor(trackerType: string | null | undefined): string {
  trackerType: string | null | undefined;
