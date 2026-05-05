/**
 * Background Task Badge
 *
 * Topbar indicator for any in-flight, completed, or errored background task.
 * Click opens a popover; each task entry resumes its originating UI through a
 * kind-specific handler registered by the parent. Generic over task kind —
 * onboarding is the first consumer.
 */

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useBackgroundTaskStore,
  selectAllTasks,
  type BackgroundTask,
} from '../../stores/backgroundTaskStore';
import { Z_INDEX } from '../../constants/zIndex';

export type ResumeHandler = (task: BackgroundTask) => void;

interface BackgroundTaskBadgeProps {
  /**
   * Per-kind resume handlers. When the user clicks a task in the popover, the
   * handler matching `task.kind` is invoked. Tasks with no handler are still
   * shown but click is a no-op (dismiss only).
   */
  resumeHandlers: Record<string, ResumeHandler>;
}

function formatElapsed(startedAt: number, completedAt?: number): string {
  const end = completedAt ?? Date.now();
  const elapsedSec = Math.max(0, Math.floor((end - startedAt) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return `${min}m ${sec}s`;
}

function StatusDot({ status }: { status: BackgroundTask['status'] }) {
  const cls =
    status === 'running'
      ? 'bg-accent animate-pulse'
      : status === 'completed'
        ? 'bg-success'
        : 'bg-danger';
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls}`} aria-hidden="true" />;
}

export function BackgroundTaskBadge({ resumeHandlers }: BackgroundTaskBadgeProps) {
  const tasks = useBackgroundTaskStore(useShallow(selectAllTasks));
  const dismiss = useBackgroundTaskStore((s) => s.dismiss);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Tick every second while popover is open so elapsed times update live
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Outside click closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (tasks.length === 0) setOpen(false);
  }, [tasks.length]);

  if (tasks.length === 0) return null;

  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const errorCount = tasks.filter((t) => t.status === 'error').length;
  const hasReadyToReview = tasks.some((t) => t.status === 'completed');
  const indicatorTone = errorCount > 0 ? 'text-danger' : runningCount > 0 ? 'text-accent' : 'text-success';

  const handleResume = (task: BackgroundTask) => {
    const handler = resumeHandlers[task.kind];
    if (handler) handler(task);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`relative p-1.5 rounded-md transition-colors ${
          open ? 'bg-surface-3' : 'hover:bg-surface-3'
        } ${indicatorTone}`}
        aria-label={`${tasks.length} background task${tasks.length === 1 ? '' : 's'}`}
        aria-expanded={open}
      >
        <svg
          className={`w-4 h-4 ${runningCount > 0 ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {runningCount > 0 ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4.5v3m0 9v3m7.5-7.5h-3m-9 0h-3m13.06-6.56-2.12 2.12m-9.88 9.88-2.12 2.12m12 0-2.12-2.12m-9.88-9.88L5.06 5.06"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          )}
        </svg>
        {tasks.length > 1 && (
          <span className="absolute -top-0.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-tiny font-semibold bg-accent text-white rounded-full">
            {tasks.length > 99 ? '99+' : tasks.length}
          </span>
        )}
        {hasReadyToReview && runningCount === 0 && errorCount === 0 && tasks.length === 1 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 bg-surface-elevated rounded-lg border border-border-subtle shadow-lg overflow-hidden"
          style={{ zIndex: Z_INDEX.dropdown }}
          role="dialog"
          aria-label="Background tasks"
        >
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Background Tasks
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {tasks.map((task) => {
              const canResume = Boolean(resumeHandlers[task.kind]);
              const canDismiss = task.status !== 'running';
              const subtitle =
                task.status === 'running'
                  ? task.messages.length > 0
                    ? task.messages[task.messages.length - 1]
                    : `Running · ${formatElapsed(task.startedAt)}`
                  : task.status === 'error'
                    ? task.error ?? 'Failed'
                    : `Ready to review · ${formatElapsed(task.startedAt, task.completedAt)}`;

              return (
                <li
                  key={task.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-surface-3 transition-colors"
                >
                  <StatusDot status={task.status} />
                  <button
                    type="button"
                    onClick={() => handleResume(task)}
                    disabled={!canResume}
                    className="flex-1 min-w-0 text-left disabled:cursor-default"
                  >
                    <div className="text-sm text-text-primary truncate">{task.label}</div>
                    <div className="text-xs text-text-muted truncate">{subtitle}</div>
                  </button>
                  <button
                    onClick={() => dismiss(task.id)}
                    disabled={!canDismiss}
                    className="flex-shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted"
                    aria-label={`Dismiss ${task.label}`}
                    title={canDismiss ? 'Dismiss' : 'Can be dismissed after it finishes'}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
