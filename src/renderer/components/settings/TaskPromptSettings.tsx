import { useState, useEffect, useCallback } from 'react';
import type { TaskPromptTemplate } from '../../../shared/types';
import { useTaskPromptTemplateStore } from '../../stores/taskPromptTemplateStore';
import { LoadingSpinner } from '../ui/LoadingButton';
import { toast } from '../../stores/toastStore';

interface Props {
  currentProjectId?: string | null;
}

export function TaskPromptSettings({ currentProjectId }: Props) {
  // Use Zustand store for persisted state (prevents state loss on navigation)
  const templates = useTaskPromptTemplateStore((state) => state.templates);
  const selectedTemplateId = useTaskPromptTemplateStore((state) => state.selectedTemplateId);
  const isLoading = useTaskPromptTemplateStore((state) => state.isLoading);
  const scope = useTaskPromptTemplateStore((state) => state.scope);
  const setScope = useTaskPromptTemplateStore((state) => state.setScope);
  const setSelectedTemplateId = useTaskPromptTemplateStore((state) => state.setSelectedTemplateId);
  const loadTemplatesFromStore = useTaskPromptTemplateStore((state) => state.loadTemplates);

  // Derived state
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  // Local UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showingBuiltinDefault, setShowingBuiltinDefault] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [promptContent, setPromptContent] = useState('');

  // Load templates when scope or project changes
  const loadTemplates = useCallback(async () => {
    await loadTemplatesFromStore(scope, currentProjectId ?? null);
  }, [scope, currentProjectId, loadTemplatesFromStore]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // Sync form state when selection changes
  useEffect(() => {
    if (selectedTemplate) {
      setName(selectedTemplate.name);
      setPromptContent(selectedTemplate.prompt_content);
      setShowingBuiltinDefault(false);
    }
  }, [selectedTemplate]);

  // Load default prompt when no templates exist
  useEffect(() => {
    const loadDefaultIfEmpty = async () => {
      if (!isLoading && templates.length === 0 && !selectedTemplate) {
        if (result.success && result.promptContent) {
          setPromptContent(result.promptContent);
          setName('');
          setShowingBuiltinDefault(true);
        }
      }
    };
    void loadDefaultIfEmpty();

  const selectTemplate = (template: TaskPromptTemplate) => {
    setSelectedTemplateId(template.id);
    setName(template.name);
    setPromptContent(template.prompt_content);
    setShowingBuiltinDefault(false);
  };

  const clearForm = () => {
    setName('');
    setPromptContent('');
  };

  const handleCreate = async () => {
    // Get the default prompt content
    const defaultContent = result.success && result.promptContent ? result.promptContent : '';

    setSelectedTemplateId(null);
    setName('');
    setPromptContent(defaultContent);
    setShowingBuiltinDefault(true);
  };

  const handleResetToDefault = async () => {
    setIsResetting(true);
    try {
      if (result.success && result.promptContent) {
        setPromptContent(result.promptContent);
        toast.success('Reset to default');
      } else {
        toast.error(result.error || 'Failed to get default prompt');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSaving(true);

    try {
      } else {
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    setIsDeleting(true);

    try {
      if (result.success) {
        setSelectedTemplateId(null);
        clearForm();
        toast.success('Template deleted');
      } else {
        toast.error(result.error || 'Failed to delete template');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedTemplate) return;

    try {
      if (result.success && result.template) {
        setSelectedTemplateId(result.template.id);
        toast.success('Set as default');
      } else {
        toast.error(result.error || 'Failed to set default');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set default');
    }
  };

  const isProcessing = isSaving || isDeleting || isResetting;

  return (
    <div className="space-y-5">
      {/* Scope selector - only show if project is open */}
      {currentProjectId && (
        <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl w-fit">
          <ScopeButton
            active={scope === 'global'}
            onClick={() => setScope('global')}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            }
          >
            Global
          </ScopeButton>
          <ScopeButton
            active={scope === 'project'}
            onClick={() => setScope('project')}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
            }
          >
            This Project
          </ScopeButton>
        </div>
      )}

      <div className="grid grid-cols-[240px_1fr] gap-5 min-w-0">
        {/* Template list */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wide truncate">Templates</h4>
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

          <div className="bg-surface-2/50 rounded-xl p-2 min-h-[200px] max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner className="w-5 h-5 text-text-muted" />
              </div>
            ) : templates.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-1">
                {templates.map((template) => (
                  <TemplateListItem
                    key={template.id}
                    template={template}
                    isSelected={selectedTemplate?.id === template.id}
                    onClick={() => selectTemplate(template)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Template editor */}
        <div className="space-y-4 min-w-0 overflow-hidden">
          {/* Built-in default info banner */}
          {showingBuiltinDefault && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-accent/10 text-text-secondary text-sm border border-accent/20">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <span>This is the built-in default prompt. Give it a name and save to customize, or edit it first.</span>
            </div>
          )}

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Default, Detailed Tasks"
            />
          </div>

          {/* Prompt content textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
                Prompt Content
              </label>
              <button
                onClick={handleResetToDefault}
                disabled={isResetting}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-surface-3 rounded-md transition-colors disabled:opacity-50"
              >
                {isResetting ? (
                  <LoadingSpinner className="w-3 h-3" />
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                )}
                Reset to Default
              </button>
            </div>
            <textarea
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              rows={16}
              placeholder="Define how Claude should structure plan item titles, descriptions, and acceptance criteria..."
            />
          </div>

          {/* Help text */}
          <div className="text-xs text-text-tertiary space-y-1">
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex gap-2 min-w-0">
              {selectedTemplate && (
                <>
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
                  {!selectedTemplate.is_default && (
                    <button
                      onClick={handleSetDefault}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-lg transition-all shrink-0"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                      </svg>
                      <span>Set Default</span>
                    </button>
                  )}
                </>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isProcessing || !name.trim()}
              className="btn btn-primary"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  Saving...
                </span>
              ) : selectedTemplate ? (
                'Save Changes'
              ) : (
                'Create Template'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScopeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function ScopeButton({ active, onClick, icon, children }: ScopeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
        ${active
          ? 'bg-accent text-white shadow-sm'
          : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
        }
      `}
    >
      {icon}
      {children}
    </button>
  );
}

interface TemplateListItemProps {
  template: TaskPromptTemplate;
  isSelected: boolean;
  onClick: () => void;
}

function TemplateListItem({ template, isSelected, onClick }: TemplateListItemProps) {
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
        <span className="truncate font-medium">{template.name}</span>
        {template.is_default && (
          <span className="shrink-0 flex items-center gap-1 text-xxs text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            </svg>
            Default
          </span>
        )}
      </div>
    </button>
  );
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
        No custom templates yet. The built-in default is shown on the right.
      </p>
    </div>
  );
}
