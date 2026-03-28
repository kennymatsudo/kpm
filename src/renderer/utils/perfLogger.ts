import { isPerfLoggingEnabled, logPerfEvent as sendPerfEvent } from '../services/perfService';

export type PerfMeta = Record<string, unknown>;
export { isPerfLoggingEnabled };

function nowMs(): number {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  return Date.now();
}

export function logPerfEvent(name: string, meta?: PerfMeta): void {
  if (!isPerfLoggingEnabled()) return;
  void sendPerfEvent({ name, meta });
}

export function startPerfSpan(name: string, meta?: PerfMeta): (extraMeta?: PerfMeta) => void {
  if (!isPerfLoggingEnabled()) {
    return () => {};
  }

  const start = nowMs();
  return (extraMeta?: PerfMeta) => {
    const durationMs = nowMs() - start;
    const mergedMeta = meta && extraMeta ? { ...meta, ...extraMeta } : (meta ?? extraMeta);
    void sendPerfEvent({ name, durationMs, meta: mergedMeta });
  };
}
