/**
 * Custom Prompt Settings Component
 *
 * Settings UI for managing custom prompts used in Command+K palette.
 * All prompts are global (no project-specific scope).
 * Built-in prompts can be edited but not deleted.
 */

import { useState, useEffect, useCallback } from 'react';
import { ensureBuiltinCustomPrompts } from '../../services/promptService';
import { useCustomPromptStore } from '../../stores/customPromptStore';
import { LoadingSpinner } from '../ui/LoadingButton';
import { toast } from '../../stores/toastStore';

const ICON_OPTIONS: { value: CustomPromptIcon; label: string }[] = [
  { value: 'document', label: 'Document' },
  { value: 'chart', label: 'Chart' },
  { value: 'check', label: 'Check' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'clipboard', label: 'Clipboard' },
];

export function CustomPromptSettings() {
  // Use Zustand store for persisted state
  const prompts = useCustomPromptStore((state) => state.prompts);
  const selectedPromptId = useCustomPromptStore((state) => state.selectedPromptId);
  const isLoading = useCustomPromptStore((state) => state.isLoading);
  const storeError = useCustomPromptStore((state) => state.error);
  const setSelectedPromptId = useCustomPromptStore((state) => state.setSelectedPromptId);
  const loadPromptsFromStore = useCustomPromptStore((state) => state.loadPrompts);
  const createPromptAction = useCustomPromptStore((state) => state.createPrompt);
  const updatePromptAction = useCustomPromptStore((state) => state.updatePrompt);
  const deletePromptAction = useCustomPromptStore((state) => state.deletePrompt);

  // Derived state
  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId) || null;

  // Local UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [icon, setIcon] = useState<CustomPromptIcon>('document');
  const [keywords, setKeywords] = useState('');

  // Load prompts on mount
  const loadPrompts = useCallback(async () => {
    // First ensure built-in prompts exist
    try {
    } catch (err) {
      console.error('[CustomPromptSettings] Failed to ensure builtins:', err);
    }
    await loadPromptsFromStore();
  }, [loadPromptsFromStore]);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  // Sync form state when selection changes
  useEffect(() => {
    if (selectedPrompt && !isCreating) {
      setName(selectedPrompt.name);
      setDescription(selectedPrompt.description || '');
      setPromptContent(selectedPrompt.prompt_content);
      setIcon(selectedPrompt.icon);
      setKeywords(selectedPrompt.keywords || '');
    }
  }, [selectedPrompt, isCreating]);

  // Show store errors as toasts
  useEffect(() => {
    if (storeError) {
      toast.error(storeError);
    }
  }, [storeError]);

  const selectPrompt = (prompt: CustomPrompt) => {
    setSelectedPromptId(prompt.id);
    setName(prompt.name);
    setDescription(prompt.description || '');
    setPromptContent(prompt.prompt_content);
    setIcon(prompt.icon);
    setKeywords(prompt.keywords || '');
    setIsCreating(false);
  };

  const clearForm = () => {
    setName('');
    setDescription('');
    setPromptContent('');
    setIcon('document');
    setKeywords('');
  };

  const handleCreate = () => {
    setSelectedPromptId(null);
    clearForm();
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Prompt name is required');
      return;
    }

    if (!promptContent.trim()) {
      toast.error('Prompt content is required');
      return;
    }

    setIsSaving(true);

    try {
      if (selectedPrompt && !isCreating) {
        // Update existing prompt
        const saved = await updatePromptAction(selectedPrompt.id, {
          name: name.trim(),
          description: description.trim() || null,
          promptContent: promptContent.trim(),
          icon,
          keywords: keywords.trim() || null,
        });
        if (saved) {
          toast.success('Prompt saved');
          await loadPrompts();
        }
      } else {
        // Create new prompt
        const created = await createPromptAction(name.trim(), promptContent.trim(), {
          description: description.trim() || null,
          icon,
          keywords: keywords.trim() || null,
        });
        if (created) {
          toast.success('Prompt created');
          setIsCreating(false);
          await loadPrompts();
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPrompt || selectedPrompt.is_builtin) return;

    setIsDeleting(true);

    try {
      const deleted = await deletePromptAction(selectedPrompt.id);
      if (deleted) {
        clearForm();
        toast.success('Prompt deleted');
        await loadPrompts();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const isProcessing = isSaving || isDeleting;

  return (
      </div>

        {/* Prompt list */}
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wide truncate">Prompts</h4>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent-subtle rounded-md transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner className="w-5 h-5 text-text-muted" />
              </div>
            ) : prompts.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-1">
                {prompts.map((prompt) => (
                  <PromptListItem
                    key={prompt.id}
                    prompt={prompt}
                    isSelected={selectedPrompt?.id === prompt.id && !isCreating}
                    onClick={() => selectPrompt(prompt)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Prompt editor */}
          {/* Built-in prompt info */}
          {selectedPrompt?.is_builtin && !isCreating && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-surface-3 text-text-secondary text-sm">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
            </div>
          )}

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Update, Release Notes"
            />
          </div>

          {/* Description input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
              Description <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description shown in Command+K"
            />
          </div>

          {/* Icon and Keywords row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
                Icon
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
                Keywords <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="weekly, report, summary"
              />
            </div>
          </div>

          {/* Prompt content textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
              Prompt Content
            </label>
            <textarea
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              placeholder="Enter instructions for what you want Claude to generate..."
            />
          </div>

          {/* Help text */}
          <div className="text-xs text-text-tertiary">
          </div>

            <div className="flex gap-2 min-w-0">
              {selectedPrompt && !selectedPrompt.is_builtin && !isCreating && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-danger hover:bg-danger-muted/50 rounded-lg transition-all disabled:opacity-50 shrink-0"
                >
                  {isDeleting ? (
                    <>
                      <LoadingSpinner className="w-3.5 h-3.5" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                      <span>Delete</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isProcessing || !name.trim() || !promptContent.trim()}
              className="btn btn-primary"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  Saving...
                </span>
              ) : isCreating ? (
                'Create Prompt'
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PromptListItemProps {
  prompt: CustomPrompt;
  isSelected: boolean;
  onClick: () => void;
}

function PromptListItem({ prompt, isSelected, onClick }: PromptListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all
        ${isSelected
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : 'hover:bg-surface-3 text-text-primary'
        }
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PromptIcon icon={prompt.icon} className="w-3.5 h-3.5 shrink-0 text-text-muted" />
          <span className="truncate font-medium">{prompt.name}</span>
        </div>
        {prompt.is_builtin && (
            Built-in
          </span>
        )}
      </div>
      {prompt.description && (
      )}
    </button>
  );
}

function PromptIcon({ icon, className }: { icon: CustomPromptIcon; className?: string }) {
  switch (icon) {
    case 'chart':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      );
    case 'check':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      );
    case 'document':
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
  }
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-3">
      <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </div>
      <p className="text-xs text-text-muted leading-relaxed">
      </p>
    </div>
  );
}
