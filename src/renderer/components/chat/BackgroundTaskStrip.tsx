import { useState } from 'react';
import type { AgentBackgroundTask } from '../../../shared/types';

/**
 * The session's live background work, shown below the transcript.
 *
 * This is the one indicator that survives a finished turn: backgrounded shells
 * and subagents keep running after the response lands, and without this the
 * conversation reads as complete while work is still going.
 */
export function BackgroundTaskStrip({ tasks }: { tasks: AgentBackgroundTask[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  const label = `${tasks.length} running in the background`;

  return (
    <div className="chat-process-channel my-3">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="w-full flex items-center gap-2 py-1.5 font-mono text-tiny text-text-muted hover:text-text-secondary transition-colors text-left"
        aria-expanded={expanded}
        aria-label={`${label}, still running`}
      >
        <span className="chat-process-marker" aria-hidden="true">
          <span className="pulse-dot block" style={{ width: 6, height: 6 }} />
        </span>
        <span className="truncate">{label}</span>
      </button>
      {expanded && (
        <ul className="pb-1">
          {tasks.map((task) => (
            <li
              key={task.taskId}
              className="flex items-center gap-2 py-0.5 pl-6 font-mono text-tiny text-text-muted"
            >
              <span className="truncate">{task.description || task.taskType}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
