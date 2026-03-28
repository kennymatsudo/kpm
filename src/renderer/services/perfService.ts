  name: string;
  durationMs?: number;
  meta?: Record<string, unknown>;

export function isPerfLoggingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.api?.perf?.enabled);
}

export function logPerfEvent(event: PerfEventInput) {
  return window.api.perf.log(event);
}
