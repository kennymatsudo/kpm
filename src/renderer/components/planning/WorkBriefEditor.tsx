import type { WorkBriefDraft } from '../../../shared/workBrief';
import { PLAN_ITEM_FIELDS } from '../../../shared/planItemFields';
import { useCredentialStore } from '../../stores/tracker/useCredentialStore';
import { trackerLabelFor } from '../tracker/shared/trackerDisplay';

export type WorkBriefEditorValue = Omit<WorkBriefDraft, 'title'>;

interface WorkBriefEditorProps {
  value: WorkBriefEditorValue;
  onChange: (value: WorkBriefEditorValue) => void;
  disabled?: boolean;
  idPrefix: string;
}

const INTENT_MAX_CHARS = PLAN_ITEM_FIELDS.intent.fieldKind.maxLength;
const CONTEXT_MAX_CHARS = PLAN_ITEM_FIELDS.description.fieldKind.maxLength;
const CRITERION_MAX_CHARS = PLAN_ITEM_FIELDS.acceptance_criteria.fieldKind.maxItemLength;
const MAX_CRITERIA = PLAN_ITEM_FIELDS.acceptance_criteria.fieldKind.maxItems;

export function WorkBriefEditor({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: WorkBriefEditorProps) {
  const selectedTrackerType = useCredentialStore((state) => state.selectedTrackerType);
  const trackerLabel = trackerLabelFor(selectedTrackerType);
  const criteria = value.acceptance_criteria;

  const updateCriterion = (index: number, criterion: string) => {
    const nextCriteria = criteria.slice();
    nextCriteria[index] = criterion;
    onChange({ ...value, acceptance_criteria: nextCriteria });
  };

  return (
    <section
      className="rounded-lg border border-border-subtle bg-surface-1/50 px-4 py-3 space-y-4"
      aria-labelledby={`${idPrefix}-heading`}
    >
      <div>
        <h3
          id={`${idPrefix}-heading`}
          className="text-xs font-medium text-text-muted uppercase tracking-wide"
        >
          Work Brief
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Context is shared with {trackerLabel}. Intent and Acceptance Criteria guide execution.
        </p>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-intent`}
          className="block text-xxs font-medium text-text-muted uppercase tracking-wide mb-1"
        >
          Intent
          <span className="ml-1.5 text-text-muted/70 normal-case">one sentence</span>
        </label>
        <textarea
          id={`${idPrefix}-intent`}
          value={value.intent ?? ''}
          onChange={(event) => onChange({ ...value, intent: event.target.value })}
          placeholder="What should this work accomplish?"
          rows={2}
          maxLength={INTENT_MAX_CHARS}
          disabled={disabled}
          className="input w-full text-sm leading-snug resize-none"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-context`}
          className="flex items-center justify-between mb-1"
        >
          <span className="text-xxs font-medium text-text-muted uppercase tracking-wide">Context</span>
          <span className="text-xxs text-text-muted opacity-60">Markdown</span>
        </label>
        <textarea
          id={`${idPrefix}-context`}
          value={value.context ?? ''}
          onChange={(event) => onChange({ ...value, context: event.target.value })}
          placeholder="Add rationale, background, or constraints."
          rows={5}
          maxLength={CONTEXT_MAX_CHARS}
          disabled={disabled}
          className="input w-full min-h-[120px] resize-y text-sm font-mono leading-relaxed"
        />
      </div>

      <fieldset>
        <legend className="text-xxs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          Acceptance Criteria
          {criteria.length > 0 && (
            <span className="ml-1.5 text-text-muted/70 normal-case">({criteria.length})</span>
          )}
        </legend>

        {criteria.length === 0 ? (
          <p className="text-sm text-text-muted italic mb-2">
            Add a testable checklist for what counts as done.
          </p>
        ) : (
          <ul className="space-y-1.5 mb-2">
            {criteria.map((criterion, index) => (
              <li key={index} className="flex items-start gap-2">
                <svg
                  className="w-3.5 h-3.5 mt-2 flex-shrink-0 text-text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5" />
                </svg>
                <input
                  type="text"
                  value={criterion}
                  onChange={(event) => updateCriterion(index, event.target.value)}
                  placeholder="Testable criterion..."
                  maxLength={CRITERION_MAX_CHARS}
                  disabled={disabled}
                  className="input flex-1 min-w-0 text-sm"
                  aria-label={`Acceptance criterion ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => onChange({
                    ...value,
                    acceptance_criteria: criteria.filter((_, criterionIndex) => criterionIndex !== index),
                  })}
                  disabled={disabled}
                  className="mt-1.5 p-1 text-text-muted hover:text-danger hover:bg-surface-2 rounded transition-colors disabled:opacity-40"
                  aria-label={`Remove criterion ${index + 1}`}
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => onChange({ ...value, acceptance_criteria: [...criteria, ''] })}
          disabled={disabled || criteria.length >= MAX_CRITERIA}
          title={criteria.length >= MAX_CRITERIA ? `Maximum ${MAX_CRITERIA} criteria reached` : undefined}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add criterion
          {criteria.length >= MAX_CRITERIA && (
            <span className="text-text-muted ml-1">(max {MAX_CRITERIA})</span>
          )}
        </button>
      </fieldset>
    </section>
  );
}
