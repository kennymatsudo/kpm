/**
 * PhaseStepper - orientation for a session's persisted playbook cursor.
 * Falls back to the legacy Build › Review › Address › Merge lifecycle when a
 * session predates playbook snapshots.
 */

import { memo, useMemo } from 'react';
import {
  formatPlaybookStepTitle,
  parsePlaybook,
  type PlaybookStep,
} from '../../../shared/playbooks';
import { parsePassCounts } from '../../../shared/playbookRuntime';
import { formatCurrency } from '../../utils/usageFormatters';

const LEGACY_STEPS = ['Build', 'Review', 'Address', 'Merge'] as const;

interface PhaseStepperProps {
  stepIndex: number;
  playbookSnapshot?: string | null;
  currentStepId?: string | null;
  stepPassCounts?: string | null;
  stepCosts?: Record<string, number>;
  /** How each finished step ended ("2 to fix"), keyed by step id. */
  stepOutcomes?: Record<string, string>;
  /** Steps with a card to jump to; only these are clickable. */
  selectableStepIds?: readonly string[];
  onSelectStep?: (stepId: string) => void;
}

export function buildPlaybookStepLabels(
  steps: PlaybookStep[],
  passCounts: Record<string, number>,
  stepCosts: Record<string, number>,
  stepOutcomes: Record<string, string> = {},
): { id: string; title: string; details: string[] }[] {
  return steps.map((step) => ({
    id: step.id,
    title: formatPlaybookStepTitle(step.id),
    details: [
      ...(stepOutcomes[step.id] ? [stepOutcomes[step.id]] : []),
      ...(step.onFindings ? [`pass ${passCounts[step.id] ?? 0}/${step.onFindings.maxPasses}`] : []),
      ...(stepCosts[step.id] != null ? [formatCurrency(stepCosts[step.id])] : []),
    ],
  }));
}

function stepTone(isActive: boolean, isDone: boolean): string {
  return isActive ? 'font-medium text-accent' : isDone ? 'text-text-muted' : 'text-text-tertiary';
}

function StepText({ title, details }: { title: string; details: string[] }) {
  return <>{title}{details.length > 0 && <span className="ml-1 font-normal text-text-tertiary">· {details.join(' · ')}</span>}</>;
}

export const PhaseStepper = memo(function PhaseStepper({
  stepIndex,
  playbookSnapshot,
  currentStepId,
  stepPassCounts,
  stepCosts = {},
  stepOutcomes,
  selectableStepIds,
  onSelectStep,
}: PhaseStepperProps) {
  const playbookSteps = useMemo(() => {
    if (!playbookSnapshot) return null;
    try {
      return parsePlaybook(JSON.parse(playbookSnapshot)).steps;
    } catch {
      return null;
    }
  }, [playbookSnapshot]);
  const passCounts = useMemo(() => parsePassCounts(stepPassCounts), [stepPassCounts]);

  const steps = playbookSteps
    ? buildPlaybookStepLabels(playbookSteps, passCounts, stepCosts, stepOutcomes)
    : LEGACY_STEPS.map((title, index) => ({ id: `legacy-${index}`, title, details: [] }));
  const activeIndex = playbookSteps && currentStepId
    ? Math.max(0, playbookSteps.findIndex((step) => step.id === currentStepId))
    : stepIndex;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 text-tiny" aria-label="Session phase">
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        return (
          <div key={step.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className={isDone ? 'text-text-tertiary' : 'text-border-default'} aria-hidden="true">
                ›
              </span>
            )}
            {onSelectStep && selectableStepIds?.includes(step.id) ? (
              <button
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`${stepTone(isActive, isDone)} rounded-sm hover:underline hover:underline-offset-2`}
                aria-current={isActive ? 'step' : undefined}
              >
                <StepText title={step.title} details={step.details} />
              </button>
            ) : (
              <span className={stepTone(isActive, isDone)} aria-current={isActive ? 'step' : undefined}>
                <StepText title={step.title} details={step.details} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
