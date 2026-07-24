import type { PlanAction, PlanItem } from '../../../../shared/types';
import { DiffViewer, InlineDiff, getInlineDiffHunks } from '../../ui/DiffViewer';

interface ReviseWorkBriefDetailProps {
  action: Extract<PlanAction, { type: 'revise_work_brief' }>;
  item: PlanItem | undefined;
}

export function ReviseWorkBriefDetail({ action, item }: ReviseWorkBriefDetailProps) {
  const currentCriteria = item?.acceptance_criteria ?? [];
  const nextBrief = action.work_brief;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-accent/12 text-accent">
          Revise Work Brief
        </span>
        <span className="text-xxs text-text-muted">Revision {action.expected_revision}</span>
      </div>

      {!item && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          The current Plan Item is no longer available.
        </div>
      )}

      <BriefTextChange
        label="Title"
        currentValue={item?.title ?? null}
        nextValue={nextBrief.title}
        emptyLabel="No title"
      />
      <BriefTextChange
        label="Intent"
        currentValue={item?.intent ?? null}
        nextValue={nextBrief.intent}
        emptyLabel="No intent"
      />

      <div>
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">
          Acceptance Criteria
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <CriteriaList
            label="Current"
            criteria={currentCriteria}
            comparisonCriteria={nextBrief.acceptance_criteria}
            tone="removed"
          />
          <CriteriaList
            label="Proposed"
            criteria={nextBrief.acceptance_criteria}
            comparisonCriteria={currentCriteria}
            tone="added"
          />
        </div>
      </div>

      <div>
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">
          Context
        </div>
        <DiffViewer oldContent={item?.description ?? ''} newContent={nextBrief.context ?? ''} />
      </div>
    </div>
  );
}

function BriefTextChange({
  label,
  currentValue,
  nextValue,
  emptyLabel,
}: {
  label: string;
  currentValue: string | null;
  nextValue: string | null;
  emptyLabel: string;
}) {
  const hasContent = Boolean(currentValue || nextValue);
  return (
    <div>
      <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-2">
        {hasContent ? (
          <InlineDiff hunks={getInlineDiffHunks(currentValue, nextValue)} />
        ) : (
          <span className="text-xs text-text-tertiary italic">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

function CriteriaList({
  label,
  criteria,
  comparisonCriteria,
  tone,
}: {
  label: string;
  criteria: string[];
  comparisonCriteria: string[];
  tone: 'added' | 'removed';
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-2">
      <div className="mb-1.5 text-xxs font-medium text-text-muted">{label}</div>
      {criteria.length > 0 ? (
        <ul className="space-y-1.5">
          {criteria.map((criterion, index) => {
            const isChanged = !comparisonCriteria.includes(criterion);
            return (
              <li
                key={`${criterion}-${index}`}
                className={`text-xs leading-relaxed ${
                  !isChanged
                    ? 'text-text-secondary'
                    : tone === 'added'
                      ? 'text-success'
                      : 'text-danger line-through decoration-danger/50'
                }`}
              >
                {criterion}
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="text-xs text-text-tertiary italic">None</span>
      )}
    </div>
  );
}
