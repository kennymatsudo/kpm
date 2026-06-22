/**
 * PhaseStepper - Macro orientation for a session: Build › Review › Address › Merge.
 *
 * Renders the four lifecycle milestones with the active one highlighted, prior
 * ones marked done, and upcoming ones muted. Driven by `stepIndex` from
 * `derivePanelStatus` — it answers "where in the lifecycle is this session"
 * while the Next strip answers "what exactly to do".
 */

import { memo } from 'react';

const STEPS = ['Build', 'Review', 'Address', 'Merge'] as const;

export const PhaseStepper = memo(function PhaseStepper({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 text-tiny" aria-label="Session phase">
      {STEPS.map((label, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className={isDone ? 'text-text-tertiary' : 'text-border-default'} aria-hidden="true">
                ›
              </span>
            )}
            <span
              className={
                isActive
                  ? 'font-medium text-accent'
                  : isDone
                    ? 'text-text-muted'
                    : 'text-text-tertiary'
              }
              aria-current={isActive ? 'step' : undefined}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
