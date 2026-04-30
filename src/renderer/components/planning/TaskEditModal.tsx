import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { m } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';

// Stable empty array to avoid re-render loops
const EMPTY_ISSUE_TYPES: TrackerIssueTypeOption[] = [];

// Fallback options when no Jira connection exists
const FALLBACK_TYPE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
] as const;

interface TaskEditModalProps {
  item: PlanItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: {
    title: string;
    description: string | null;
    label: string | null;
    intent?: string | null;
    acceptance_criteria?: string[] | null;
  }) => Promise<void>;
}

// Zod-aligned limits (see src/main/ipc/validation/plan.ts)
const INTENT_MAX_CHARS = 500;
const CRITERION_MAX_CHARS = 1000;
const MAX_CRITERIA = 50;

export function TaskEditModal({
  item,
  isOpen,
  onClose,
  onSave,
}: TaskEditModalProps) {
  // Get Jira issue types from the associated project
  const associations = useTrackerStore(useShallow((state) => state.associations));
  const association = useMemo(() => {
    if (!item.association_id) return null;
    return associations.find((a) => a.id === item.association_id) ?? null;
  }, [item.association_id, associations]);
  const projectKey = association?.project_key ?? null;
  const trackerType = item.external_type ?? association?.tracker_type ?? null;
  const trackerLabel = trackerLabelFor(trackerType);
  const shouldUseTrackerIssueTypes = trackerType === 'jira';

  // Get cached issue types + loader in a single subscription
  const { jiraIssueTypes, loadIssueTypes } = useTrackerMetadataStore(
    useShallow((state) => ({
      jiraIssueTypes: projectKey && shouldUseTrackerIssueTypes ? state.issueTypesByProject[projectKey] ?? EMPTY_ISSUE_TYPES : EMPTY_ISSUE_TYPES,
      loadIssueTypes: state.loadIssueTypes,
    }))
  );
  // Load issue types when modal opens (if we have a project key)
  useEffect(() => {
    if (isOpen && projectKey && shouldUseTrackerIssueTypes) {
      void loadIssueTypes(projectKey);
    }
  }, [isOpen, projectKey, shouldUseTrackerIssueTypes, loadIssueTypes]);

  // Build type options from Jira or use fallback
  const typeOptions = useMemo(() => {
    if (jiraIssueTypes.length > 0) {
      return [
        { value: '', label: 'None' },
        ...jiraIssueTypes.map((t) => ({ value: t.name.toLowerCase(), label: t.name })),
      ];
    }
    return FALLBACK_TYPE_OPTIONS;
  }, [jiraIssueTypes]);

  // Form state
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || '');
  const [label, setLabel] = useState(item.label || '');
  // Spec fields — editable in this sprint.
  const [intent, setIntent] = useState(item.intent ?? '');
  const [criteria, setCriteria] = useState<string[]>(item.acceptance_criteria ?? []);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const animationCompleteRef = useRef(false);

  // Sync state when item changes
  useEffect(() => {
    if (isOpen) {
      animationCompleteRef.current = false;
      setTitle(item.title);
      setDescription(item.description || '');
      setLabel(item.label || '');
      setIntent(item.intent ?? '');
      setCriteria(item.acceptance_criteria ?? []);
    }
  }, [
    item.id,
    item.title,
    item.description,
    item.label,
    item.intent,
    item.acceptance_criteria,
    isOpen,
  ]);

  // Focus title input when modal open animation finishes
  const handleAnimationComplete = useCallback(() => {
    if (animationCompleteRef.current) return;
    animationCompleteRef.current = true;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  // Normalize criteria for save + diff: trim, drop empties, cap at MAX_CRITERIA.
  const sanitizedCriteria = useMemo(() => {
    const trimmed = criteria.map((c) => c.trim()).filter((c) => c.length > 0);
    return trimmed.slice(0, MAX_CRITERIA);
  }, [criteria]);

  const originalCriteria = useMemo(() => item.acceptance_criteria ?? [], [item.acceptance_criteria]);

  // Track unsaved changes
  const isDirty = useMemo(() => {
    const titleChanged = title.trim() !== item.title.trim();
    const descChanged = description.trim() !== (item.description || '').trim();
    const labelChanged = label !== (item.label || '');
    const intentChanged = intent.trim() !== (item.intent ?? '').trim();
    const criteriaChanged =
      sanitizedCriteria.length !== originalCriteria.length ||
      sanitizedCriteria.some((c, i) => c !== originalCriteria[i]);

  // Validate form
  const canSave = useMemo(() => {
    if (!isDirty || title.trim().length === 0) return false;
    if (intent.length > INTENT_MAX_CHARS) return false;
    if (sanitizedCriteria.some((c) => c.length > CRITERION_MAX_CHARS)) return false;
    return true;
  }, [isDirty, title, intent, sanitizedCriteria]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      const trimmedIntent = intent.trim();
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        label: label || null,
        intent: trimmedIntent.length > 0 ? trimmedIntent : null,
        acceptance_criteria: sanitizedCriteria.length > 0 ? sanitizedCriteria : null,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setIsSaving(false);
    }

  // Criteria list helpers
  const updateCriterion = useCallback((index: number, value: string) => {
    setCriteria((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  const removeCriterion = useCallback((index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addCriterion = useCallback(() => {
    setCriteria((prev) => (prev.length >= MAX_CRITERIA ? prev : [...prev, '']));
  }, []);

  // Handle close with unsaved changes check
  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSave]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleRequestClose}
        size="xl"
        className="flex flex-col overflow-hidden"
        closeOnBackdropClick={!isDirty}
        preventClose={isSaving}
        onAnimationComplete={handleAnimationComplete}
        aria-labelledby="task-edit-title"
      >
        {/* Accent gradient line */}
        <div
          className="h-[2px] opacity-60"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--color-accent) 20%, var(--color-accent) 80%, transparent)',
          }}
        />

        <ModalHeader
          id="task-edit-title"
          onClose={handleRequestClose}
          className="shrink-0"
          icon={
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          }
          subtitle={item.external_key ? <span className="font-mono">{item.external_key}</span> : undefined}
        >
          Edit Task
        </ModalHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2 pt-5 space-y-5">
          {/* Title field */}
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Title
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="input w-full text-base"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Description
            </label>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description... (Markdown supported)"
              />
              <div className="absolute bottom-2 right-2 text-xxs text-text-muted opacity-60 pointer-events-none">
                Markdown
              </div>
            </div>
          </div>

          <div
            className="rounded-lg border border-border-subtle bg-surface-1/50 px-4 py-3 space-y-3"
            aria-label="Spec"
          >

            {/* Intent */}
            <div>
              <label
                htmlFor="task-edit-intent"
                className="block text-xxs font-medium text-text-muted uppercase tracking-wide mb-1"
              >
                Intent
                <span className="ml-1.5 text-text-muted/70 normal-case">one sentence</span>
              </label>
              <textarea
                id="task-edit-intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="What done looks like, in one sentence..."
                rows={2}
                maxLength={INTENT_MAX_CHARS}
                className="input w-full text-sm leading-snug resize-none"
              />
            </div>

            {/* Acceptance Criteria */}
            <div>
              </div>

              {criteria.length === 0 ? (
                <p className="text-sm text-text-muted italic mb-2">
                  A testable checklist for what counts as done.
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
                        onChange={(e) => updateCriterion(index, e.target.value)}
                        placeholder="Testable criterion..."
                        maxLength={CRITERION_MAX_CHARS}
                        className="input flex-1 min-w-0 text-sm"
                        aria-label={`Acceptance criterion ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeCriterion(index)}
                        className="mt-1.5 p-1 text-text-muted hover:text-danger hover:bg-surface-2 rounded transition-colors"
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
                onClick={addCriterion}
                disabled={criteria.length >= MAX_CRITERIA}
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
            </div>
          </div>

                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
          </div>

          {(item.external_key || item.release_tag || (item.code_refs && item.code_refs.length > 0)) && (
            <div className="pt-4 border-t border-border-subtle">
              </h3>
                {item.external_key && item.external_url && (
                )}

                {item.release_tag && (
                )}

              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-border-subtle flex items-center justify-between bg-surface-1/50">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {isDirty && (
              <m.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                Unsaved changes
              </m.span>
            )}
            <span className="opacity-50">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-3 text-xxs font-mono">⌘S</kbd> to save
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MotionButton
              variant="secondary"
              onClick={handleRequestClose}
              disabled={isSaving}
            >
              Cancel
            </MotionButton>
            <MotionButton
              variant="primary"
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </MotionButton>
          </div>
        </div>
      </Modal>

      {/* Discard confirmation */}
      {showDiscardDialog && (
        <ConfirmActionDialog
          title="Discard changes?"
          message="You have unsaved changes that will be lost."
          action={{
            label: 'Discard',
            variant: 'danger',
            onClick: () => {
              setShowDiscardDialog(false);
              onClose();
            },
          }}
          onCancel={() => setShowDiscardDialog(false)}
        />
      )}
    </>
  );
}
