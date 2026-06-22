/**
 * LiveProgressFooter - The bottom region while the agent is working.
 *
 * Replaces the old disabled "Working — chat opens when done" input band with
 * honest live telemetry: the current step (latest narration), elapsed time, and
 * change magnitude, plus Stop when the run is user-stoppable. Free-text input
 * returns (DetailChatInput) only once the agent is terminal.
 *
 * Elapsed ticks here rather than in the status derivation so the whole panel
 * status isn't recomputed every second.
 */

import { memo, useEffect, useState } from 'react';
import type { ProgressInfo } from './panelStatus';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function parseStartedAt(value: string | number): number {
  if (typeof value === 'number') return value;

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return Date.parse(`${trimmed.replace(' ', 'T')}Z`);
  }

  return new Date(trimmed).getTime();
}

export const LiveProgressFooter = memo(function LiveProgressFooter({
  progress,
  startedAt,
  onStop,
}: {
  progress: ProgressInfo;
  startedAt: string | number;
  onStop?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startedAtMs = parseStartedAt(startedAt);
  const elapsedMs = Number.isFinite(startedAtMs) ? now - startedAtMs : 0;
  const { diffStats } = progress;
  const hasMagnitude = diffStats && (diffStats.files > 0 || diffStats.additions > 0 || diffStats.deletions > 0);

  return (
    <div className="flex items-center gap-2.5 border-t border-border-subtle bg-surface-1 px-4 py-2.5">
      <span
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
          <span className="shrink-0 font-medium text-text-primary">{progress.label}</span>
          {progress.detail && (
            <span className="min-w-0 truncate text-text-muted">· {progress.detail}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-tiny tabular-nums text-text-tertiary">
          <span>{formatElapsed(elapsedMs)}</span>
          {hasMagnitude && (
            <>
              <span aria-hidden="true">·</span>
              <span>{diffStats.files} {diffStats.files === 1 ? 'file' : 'files'}</span>
              {(diffStats.additions > 0 || diffStats.deletions > 0) && (
                <span>+{diffStats.additions} −{diffStats.deletions}</span>
              )}
            </>
          )}
        </div>
      </div>
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="shrink-0 rounded px-2 py-1 text-tiny text-red-400 transition-colors hover:bg-red-400/10"
        >
          Stop
        </button>
      )}
    </div>
  );
});
