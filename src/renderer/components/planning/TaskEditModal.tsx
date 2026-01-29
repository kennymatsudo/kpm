import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Stable empty array to avoid re-render loops

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
  }) => Promise<void>;
}

export function TaskEditModal({
  item,
  isOpen,
  onClose,
  onSave,
}: TaskEditModalProps) {
  // Get Jira issue types from the associated project
  const associations = useTrackerStore(useShallow((state) => state.associations));
    if (!item.association_id) return null;
  }, [item.association_id, associations]);

  );
  // Load issue types when modal opens (if we have a project key)
  useEffect(() => {
      void loadIssueTypes(projectKey);
    }

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

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync state when item changes
  useEffect(() => {
    if (isOpen) {
      setTitle(item.title);
      setDescription(item.description || '');
      setLabel(item.label || '');
    }

  // Track unsaved changes
  const isDirty = useMemo(() => {
    const titleChanged = title.trim() !== item.title.trim();
    const descChanged = description.trim() !== (item.description || '').trim();
    const labelChanged = label !== (item.label || '');

  // Validate form
  const canSave = useMemo(() => {
  // Handle save
  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        label: label || null,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setIsSaving(false);
    }

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
        closeOnBackdropClick={!isDirty}
        preventClose={isSaving}
        aria-labelledby="task-edit-title"
      >

        {/* Content */}
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
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description... (Markdown supported)"
              />
                Markdown
              </div>
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
        </div>

        {/* Footer */}
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
            </span>
          </div>
          <div className="flex items-center gap-2">
              onClick={handleRequestClose}
              disabled={isSaving}
            >
              Cancel
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
          </div>
        </div>
      </Modal>

      {/* Discard confirmation */}
    </>
  );
}
