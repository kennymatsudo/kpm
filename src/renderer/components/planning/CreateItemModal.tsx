/**
 * CreateItemModal - Modal for manually creating plan items
 *
 * Two modes:
 * - Quick mode (default): Title input only, Enter to create
 * - Full mode: Title, description, label, parent selector
 *
 * Quick mode is fast and lightweight; full mode provides clear structure.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { PlanItem, StatusCategory } from '../../../shared/types';

// Type options with visual indicators
const TYPE_OPTIONS: { value: string; label: string; color?: string }[] = [
  { value: '', label: 'None' },
  { value: 'task', label: 'Task', color: 'var(--color-info)' },
  { value: 'bug', label: 'Bug', color: 'var(--color-danger)' },
  { value: 'feature', label: 'Feature', color: 'var(--color-success)' },
  { value: 'epic', label: 'Epic', color: 'var(--color-purple)' },
];

export interface CreateItemData {
  title: string;
  description: string | null;
  label: string | null;
  parent_id: string | null;
  status_category: StatusCategory | null;
}

export interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** Pre-selected parent for the new item */
  defaultParentId?: string | null;
  /** Pre-selected status category (e.g., from board column) */
  defaultStatus?: StatusCategory | null;
  /** Canvas position to place the item at */
  canvasPosition?: { x: number; y: number } | null;
  /** All plan items for parent selection */
  planItems: PlanItem[];
  /** Callback when item is created */
  onSubmit: (data: CreateItemData, canvasPosition?: { x: number; y: number } | null) => Promise<void>;
}

export function CreateItemModal({
  isOpen,
  onClose,
  projectId: _projectId,
  defaultParentId = null,
  defaultStatus = null,
  canvasPosition = null,
  planItems,
  onSubmit,
}: CreateItemModalProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [label, setLabel] = useState('');
  const [parentId, setParentId] = useState<string | null>(defaultParentId);
  const [statusCategory, setStatusCategory] = useState<StatusCategory | ''>(defaultStatus ?? '');

  // UI state
  const [isFullMode, setIsFullMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setLabel('');
      setParentId(defaultParentId);
      setStatusCategory(defaultStatus ?? '');
      setIsFullMode(false);
      setTitleFocused(false);
    }
  }, [isOpen, defaultParentId, defaultStatus]);

  // Build parent options from plan items
  const parentOptions = useMemo((): { value: string; label: string; parentLabel?: string }[] => {

    return [
        value: item.id,
        label: item.title,
      })),
    ];

  // Validation
  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && !isSubmitting;
  }, [title, isSubmitting]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim() || null,
          label: label || null,
          parent_id: parentId,
          status_category: statusCategory || null,
        },
        canvasPosition
      );
      onClose();
    } catch (error) {
      console.error('[CreateItemModal] Failed to create item:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, title, description, label, parentId, statusCategory, canvasPosition, onSubmit, onClose]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !isFullMode) {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'Tab' && !e.shiftKey && !isFullMode) {
        e.preventDefault();
        setIsFullMode(true);
      }
    },
    [handleSubmit, isFullMode]
  );

  const typeColor = TYPE_OPTIONS.find(t => t.value === label)?.color;

  return (
    <Modal
      isOpen={isOpen}
      size={isFullMode ? 'lg' : 'md'}
      initialFocusRef={titleInputRef}
      preventClose={isSubmitting}
    >
      <div className="relative overflow-hidden">
        {/* Subtle gradient accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent 0%, var(--color-accent) 15%, var(--color-accent) 85%, transparent 100%)`,
            opacity: 0.5,
          }}
        />


        {/* Content */}
        <div className="px-6 pb-3">
          {/* Title field with dynamic border */}
          <div className="relative">
              className="absolute -inset-px rounded-lg pointer-events-none"
              style={{
                background: `linear-gradient(135deg, var(--color-accent) 0%, transparent 50%)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: titleFocused ? 0.15 : 0 }}
              transition={{ duration: 0.2 }}
            />
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              placeholder="What needs to be done?"
              disabled={isSubmitting}
              autoComplete="off"
            />
            {/* Character count hint */}
            <AnimatePresence>
              {title.length > 0 && (
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  {title.length}
              )}
            </AnimatePresence>
          </div>

          {/* Quick mode context indicator */}
          <AnimatePresence>
            {!isFullMode && (defaultStatus || canvasPosition) && (
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 mt-3 text-xs text-text-muted"
              >
                {defaultStatus && (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-3">
                    <span
                    />
                  </span>
                )}
                {canvasPosition && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-3">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Canvas
                  </span>
                )}
            )}
          </AnimatePresence>

          {/* Full mode fields */}
          <AnimatePresence mode="wait">
            {isFullMode && (
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-4 pt-5">
                  {/* Description field */}
                  <div>
                    <label className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                        Description
                      </span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Type and Status row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Type selector */}
                    <div>
                      <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                        Type
                      </label>
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                    </div>

                    {/* Status category selector */}
                    <div>
                      <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                        Status
                      </label>
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                    </div>
                  </div>

                  {/* Parent selector */}
                  <div>
                    <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                      Parent Item
                    </label>
                        </svg>
                      >
                        {parentOptions.map((opt) => (
                        ))}
                  </div>
                </div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between bg-surface-1/30">
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {!isFullMode && (
              <button
                onClick={() => setIsFullMode(true)}
                className="group flex items-center gap-1.5 text-text-muted hover:text-accent transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                More options
              </button>
            )}
            <span className="opacity-60 hidden sm:inline">
              {isFullMode ? (
                <span className="flex items-center gap-1.5">
                    {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+↵
                  </kbd>
                  <span>to create</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>create</span>
                  <span className="opacity-50 mx-0.5">·</span>
                  <span>expand</span>
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
              disabled={isSubmitting}
            >
              Cancel
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
          </div>
        </div>
      </div>
    </Modal>
  );
}
