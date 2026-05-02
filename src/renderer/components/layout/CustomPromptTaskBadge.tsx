/**
 * Custom Prompt Task Badge
 *
 * Top-bar indicator that surfaces in-flight Cmd+K custom prompt generations.
 * Hidden when nothing is running. Click opens a small popover listing each
 * running prompt with elapsed time and a dismiss button — escape hatch for
 * cases where the IPC completion event was lost (HMR reload, missed event).
 */

import { useEffect, useRef, useState } from 'react';
import { useCustomPromptTaskStore } from '../../stores';
import { Z_INDEX } from '../../constants/zIndex';

function formatElapsed(startedAt: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return `${min}m ${sec}s`;
}

export function CustomPromptTaskBadge() {
  const running = useCustomPromptTaskStore((s) => s.running);
  const dismissTask = useCustomPromptTaskStore((s) => s.dismissTask);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Tick every second while popover is open so elapsed times update live
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Close popover on outside click
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

  // Close popover when nothing's left to show
  useEffect(() => {
    if (running.length === 0) setOpen(false);
  }, [running.length]);

  if (running.length === 0) return null;

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`relative p-1.5 rounded-md transition-colors ${
          open ? 'text-accent bg-accent/10' : 'text-accent hover:bg-accent/10'
        }`}
        aria-label={`${running.length} custom prompt${running.length === 1 ? '' : 's'} running`}
        aria-expanded={open}
        title={
          running.length === 1
            ? `Running: ${running[0].promptName}`
            : `${running.length} prompts running`
        }
      >
        <svg
          className="w-4 h-4 animate-pulse"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
        {running.length > 1 && (
          <span className="absolute -top-0.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-tiny font-semibold bg-accent text-white rounded-full">
            {running.length > 99 ? '99+' : running.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-72 bg-surface-elevated rounded-lg border border-border-subtle shadow-lg overflow-hidden"
          style={{ zIndex: Z_INDEX.dropdown }}
          role="dialog"
          aria-label="Running custom prompts"
        >
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Running Prompts
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {running.map((task) => (
              <li
                key={task.taskId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-surface-3 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">{task.promptName}</div>
                  <div className="text-xs text-text-muted">{formatElapsed(task.startedAt)}</div>
                </div>
                <button
                  onClick={() => dismissTask(task.taskId)}
                  className="flex-shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-4 transition-colors"
                  aria-label={`Dismiss ${task.promptName}`}
                  title="Dismiss (clears indicator only — does not stop the generation)"
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
            ))}
          </ul>
          <div className="px-3 py-2 border-t border-border-subtle text-xs text-text-tertiary">
            Output saved to project's <span className="font-mono text-text-muted">outputs/</span> folder.
          </div>
        </div>
      )}
    </div>
  );
}
