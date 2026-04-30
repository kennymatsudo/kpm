/**
 * Prompt Editor Settings Component
 *
 * Settings UI for viewing and overriding configurable system prompts.
 * All prompts are global (no project-specific scope).
 */

import { useEffect, useState, useCallback } from 'react';
import { usePromptOverrideStore } from '../../stores/promptOverrideStore';

export function PromptEditorSettings() {
  const prompts = usePromptOverrideStore((s) => s.prompts);
  const selectedKey = usePromptOverrideStore((s) => s.selectedKey);
  const selectedPrompt = usePromptOverrideStore((s) => s.selectedPrompt);
  const activeCategory = usePromptOverrideStore((s) => s.activeCategory);
  const editContent = usePromptOverrideStore((s) => s.editContent);
  const isLoading = usePromptOverrideStore((s) => s.isLoading);
  const saveStatus = usePromptOverrideStore((s) => s.saveStatus);
  const error = usePromptOverrideStore((s) => s.error);

  const loadPrompts = usePromptOverrideStore((s) => s.loadPrompts);
  const selectPrompt = usePromptOverrideStore((s) => s.selectPrompt);
  const setEditContent = usePromptOverrideStore((s) => s.setEditContent);
  const saveOverride = usePromptOverrideStore((s) => s.saveOverride);
  const resetToDefault = usePromptOverrideStore((s) => s.resetToDefault);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  // Auto-select first prompt in category
  useEffect(() => {
    const filtered = prompts.filter((p) => p.category === activeCategory);
    if (filtered.length > 0 && !selectedKey) {
      void selectPrompt(filtered[0].key);
    }
  }, [prompts, activeCategory, selectedKey, selectPrompt]);

  const filteredPrompts = prompts.filter((p) => p.category === activeCategory);

  const isModified = selectedPrompt
    ? editContent !== selectedPrompt.currentContent
    : false;

  const handleSave = useCallback(async () => {
    await saveOverride();
  }, [saveOverride]);

  const handleReset = useCallback(async () => {
    await resetToDefault();
    setShowResetConfirm(false);
  }, [resetToDefault]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isModified) {
          void handleSave();
        }
      }
    },
    [isModified, handleSave]
  );

  if (isLoading && prompts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted text-sm">
        Loading prompts...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Main content: prompt list + editor */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Prompt list */}
        <div className="w-48 flex-shrink-0 space-y-1 overflow-y-auto">
          {filteredPrompts.map((p) => (
            <button
              key={p.key}
              onClick={() => void selectPrompt(p.key)}
              className={`
                w-full text-left px-3 py-2 rounded-lg text-xs transition-colors
                ${selectedKey === p.key
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-surface-3'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <span className="truncate flex-1">{p.name}</span>
                {p.hasOverride && (
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent" title="Modified" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Right: Editor */}
        <div className="flex-1 min-w-0 flex flex-col" onKeyDown={handleKeyDown}>
          {selectedPrompt ? (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              {/* Prompt name and description */}
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-text-primary">{selectedPrompt.name}</h4>
                  {selectedPrompt.hasOverride && (
                    <span className="px-1.5 py-0.5 text-xxs font-medium bg-accent/10 text-accent rounded">
                      Modified
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">{selectedPrompt.description}</p>
              </div>

              {/* Variable hints */}
              {selectedPrompt.variables && selectedPrompt.variables.length > 0 && (
                <div className="p-2 bg-surface-3/50 rounded-lg">
                  <p className="text-xxs font-medium text-text-muted uppercase tracking-wider mb-1">Available Variables</p>
                  {selectedPrompt.variables.map((v) => (
                    <div key={v.name} className="text-xs text-text-secondary">
                      <code className="text-accent/80">{v.name}</code>
                      <span className="text-text-muted ml-1.5">— {v.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Textarea */}
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 min-h-0 w-full px-3 py-3 text-xs font-mono leading-relaxed bg-surface-3 border border-border rounded-lg
                  text-text-primary placeholder:text-text-muted resize-none
                  focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
                spellCheck={false}
              />

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Reset button */}
                  {selectedPrompt.hasOverride && !showResetConfirm && (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="px-3 py-1.5 text-xs text-text-muted hover:text-red-400 transition-colors"
                    >
                      Reset to Default
                    </button>
                  )}
                  {showResetConfirm && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Reset to default?</span>
                      <button
                        onClick={() => void handleReset()}
                        className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Status indicator */}
                  {saveStatus === 'saved' && (
                    <span className="text-xs text-green-400">Saved</span>
                  )}
                  {saveStatus === 'error' && error && (
                    <span className="text-xs text-red-400">{error}</span>
                  )}

                  {/* Save button */}
                  <button
                    onClick={() => void handleSave()}
                    disabled={!isModified || saveStatus === 'saving'}
                    className="btn btn-primary text-xs px-4 py-1.5 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                    {isModified && saveStatus !== 'saving' && (
                      <kbd className="text-[10px] opacity-60 font-sans">⌘S</kbd>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Select a prompt to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
