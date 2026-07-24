import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { m } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { Modal, ModalHeader } from '../ui/Modal';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { MotionButton } from '../ui/MotionButton';
import { LoadingSpinner } from '../ui/LoadingButton';
import {
  NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useTrackerStore } from '../../stores/trackerStore';
import { useTrackerMetadataStore } from '../../stores';
import type { TrackerIssueTypeOption } from '../../stores/tracker/useMetadataStore';
import { TrackerIcon, trackerLabelFor } from '../tracker/shared/trackerDisplay';
import type { PlanItem, Repo } from '../../../shared/types';
import { PLAN_ITEM_FIELDS } from '../../../shared/planItemFields';
import type { PlanTaskEditDraft } from './planItemFormActions';
import { buildPlanTaskEditActions } from './planItemFormActions';
import { toast } from '../../stores/toastStore';
import { WorkBriefEditor } from './WorkBriefEditor';
import { RepositoryScopeEditor } from './RepositoryScopeEditor';

// Stable empty array to avoid re-render loops
const EMPTY_ISSUE_TYPES: TrackerIssueTypeOption[] = [];

// Fallback options when no Jira connection exists
const FALLBACK_TYPE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
] as const;

const MAX_CRITERIA = PLAN_ITEM_FIELDS.acceptance_criteria.fieldKind.maxItems;

interface TaskEditModalProps {
  item: PlanItem;
  repos: Repo[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: PlanTaskEditDraft) => Promise<void>;
}

function TrackerPerson({ label, name, emptyLabel = 'Not available' }: { label: string; name: string | null | undefined; emptyLabel?: string }) {
  return (
    <div>
      <div className="text-xxs text-text-muted uppercase tracking-wide mb-1">{label}</div>
      {name ? (
        <span className="text-sm text-text-primary truncate block">{name}</span>
      ) : (
        <span className="text-sm text-text-muted">{emptyLabel}</span>
      )}
    </div>
  );
}

export function TaskEditModal({
  item,
  repos,
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
  const [intent, setIntent] = useState(item.intent ?? '');
  const [criteria, setCriteria] = useState<string[]>(item.acceptance_criteria ?? []);
  const [primaryRepoId, setPrimaryRepoId] = useState<string | null>(item.primary_repo_id ?? null);
  const [affectedRepoIds, setAffectedRepoIds] = useState<string[]>(item.affected_repo_ids ?? []);

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
      setPrimaryRepoId(item.primary_repo_id ?? null);
      setAffectedRepoIds(item.affected_repo_ids ?? []);
    }
  }, [
    item.id,
    item.title,
    item.description,
    item.label,
    item.intent,
    item.acceptance_criteria,
    item.primary_repo_id,
    item.affected_repo_ids,
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

  const draft = useMemo<PlanTaskEditDraft>(() => ({
    workBrief: {
      title: title.trim(),
      context: description.trim() || null,
      intent: intent.trim() || null,
      acceptance_criteria: sanitizedCriteria,
    },
    repositoryScope: {
      primary_repo_id: primaryRepoId,
      affected_repo_ids: affectedRepoIds,
    },
    label: label || null,
  }), [
    title,
    description,
    intent,
    sanitizedCriteria,
    primaryRepoId,
    affectedRepoIds,
    label,
  ]);

  // Track unsaved changes by the same domain actions used to save.
  const isDirty = useMemo(
    () => title.trim().length > 0 && buildPlanTaskEditActions(item, draft).length > 0,
    [item, draft, title],
  );

  const canSave = isDirty && title.trim().length > 0;

  // Handle save
  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [canSave, draft, onSave, onClose]);

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
            <label htmlFor="task-edit-item-title" className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Title
            </label>
            <input
              id="task-edit-item-title"
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              maxLength={PLAN_ITEM_FIELDS.title.fieldKind.maxLength}
              className="input w-full text-base"
            />
          </div>

          <WorkBriefEditor
            value={{
              context: description,
              intent,
              acceptance_criteria: criteria,
            }}
            onChange={(workBrief) => {
              setDescription(workBrief.context ?? '');
              setIntent(workBrief.intent ?? '');
              setCriteria(workBrief.acceptance_criteria);
            }}
            idPrefix="task-edit-work-brief"
          />

          <RepositoryScopeEditor
            value={{
              primary_repo_id: primaryRepoId,
              affected_repo_ids: affectedRepoIds,
            }}
            onChange={(scope) => {
              setPrimaryRepoId(scope.primary_repo_id);
              setAffectedRepoIds(scope.affected_repo_ids);
            }}
            repos={repos}
            idPrefix="task-edit-repository-scope"
          />

          {/* Type — single attribute we let the user edit */}
          <div className="w-56">
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Type
            </label>
            {item.external_issue_type ? (
              <div className="input w-full flex items-center gap-2 bg-surface-2 cursor-not-allowed">
                <span className="text-text-primary truncate">{item.external_issue_type}</span>
                <span className="text-xs text-text-tertiary shrink-0 ml-auto">from {trackerLabel}</span>
              </div>
            ) : (
              <Select
                value={label === '' ? NONE_VALUE : label}
                onValueChange={(next) => setLabel(next === NONE_VALUE ? '' : next)}
              >
                <SelectTrigger
                  aria-label="Type"
                  className="input w-full flex items-center justify-between cursor-pointer"
                >
                  <SelectValue />
                  <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </SelectTrigger>
                <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value === '' ? NONE_VALUE : opt.value}>
                      <SelectItemText>{opt.label}</SelectItemText>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tracker people — read-only metadata from the connected tracker. */}
          {(item.external_assignee_name || item.external_creator_name) && (
            <div className="pt-4 border-t border-border-subtle">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                Tracker people
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrackerPerson label="Assigned to" name={item.external_assignee_name} emptyLabel="Unassigned" />
                <TrackerPerson label="Created by" name={item.external_creator_name} />
              </div>
            </div>
          )}

          {/* References — read-only chip strip. Tracker, release, code refs, all inline. */}
          {(item.external_key || item.release_tag || (item.code_refs && item.code_refs.length > 0)) && (
            <div className="pt-4 border-t border-border-subtle">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                References
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.external_key && item.external_url && (
                  <a
                    href={item.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${item.external_key} in ${trackerLabel}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-info-muted text-info text-xs font-medium hover:bg-info/20 transition-colors"
                  >
                    <TrackerIcon trackerType={trackerType} className="w-3 h-3" />
                    {item.external_key}
                    <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}

                {item.release_tag && (
                  <span
                    title="Release tag"
                    className="px-2 py-1 rounded bg-accent-subtle text-accent text-xs font-medium"
                  >
                    {item.release_tag}
                  </span>
                )}

                {item.code_refs?.map((ref, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded bg-surface-3 text-xs text-text-secondary font-mono truncate max-w-[200px]"
                    title={ref}
                  >
                    {ref}
                  </span>
                ))}
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
