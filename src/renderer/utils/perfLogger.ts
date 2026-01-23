

function nowMs(): number {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  return Date.now();
}

export function logPerfEvent(name: string, meta?: PerfMeta): void {
}

export function startPerfSpan(name: string, meta?: PerfMeta): (extraMeta?: PerfMeta) => void {
    return () => {};
  }

  const start = nowMs();
  return (extraMeta?: PerfMeta) => {
    const durationMs = nowMs() - start;
    const mergedMeta = meta && extraMeta ? { ...meta, ...extraMeta } : (meta ?? extraMeta);
  };
}
