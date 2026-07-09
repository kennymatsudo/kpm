/**
 * Parse a timestamp that may be a SQLite `CURRENT_TIMESTAMP` value
 * ("YYYY-MM-DD HH:MM:SS", stored as UTC with no zone suffix) or an ISO string.
 * Bare SQLite strings are interpreted as UTC; anything already carrying a zone
 * or offset is left to the native parser. Without this, `new Date` reads the
 * suffix-less string as local time and skews "time ago" by the UTC offset.
 */
function parseTimestamp(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}Z`);
  }
  return new Date(value);
}

/** Coarse "Nm ago" / "Nh ago" / "Nd ago" formatting for timestamps in secondary UI text. */
export function formatRelativeTime(iso: string): string {
  const mins = Math.round((Date.now() - parseTimestamp(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
