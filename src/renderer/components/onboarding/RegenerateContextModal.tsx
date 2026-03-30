import { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';
import { DiffViewer, getDiffStats } from '../ui/DiffViewer';
import { StepScopeFeature } from './StepScopeFeature';
import { StepContextGeneration } from './StepContextGeneration';
import { useOnboardingEvents } from '../../hooks/useOnboardingEvents';
import {
  saveOnboardingContext,
} from '../../services/onboardingService';
import {
  useContextRegenerationStore,
  useProjectDomainStore,
  useResourceDomainStore,
} from '../../stores';

type Phase = 'configure' | 'generate' | 'review';

export function RegenerateContextModal() {
  );
  const repos = useResourceDomainStore((s) => s.repos);

  const [phase, setPhase] = useState<Phase>('configure');
  const [description, setDescription] = useState('');
  const [repoDirectories, setRepoDirectories] = useState<Record<string, string[]>>({});
  const [existingContent, setExistingContent] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    messages,
    generatedContent,
    error: genError,
    isGenerating,
    startGeneration,
    reset: resetGeneration,

  const repoPaths = repos.map((r) => r.path);

  // Load existing context file and persisted directories when modal opens
  useEffect(() => {
        setExistingContent(result.success ? result.content : null);
      });
        if (dirs) setRepoDirectories(dirs);
      });
    }

  // Transition from generate -> review when generation completes
  useEffect(() => {
    if (phase === 'generate' && !isGenerating && generatedContent !== null && generatedContent.length > 0) {
      setEditableContent(generatedContent);
      setPhase('review');
    }
  }, [phase, isGenerating, generatedContent]);

  const resetModal = useCallback(() => {
    setPhase('configure');
    setDescription('');
    setRepoDirectories({});
    setExistingContent(null);
    setEditableContent('');
    setIsEditing(false);
    setIsSaving(false);
    setError(null);
    resetGeneration();
  }, [resetGeneration]);

    resetModal();
    close();

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId) return;
    setError(null);
    setPhase('generate');
    try {
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
      setPhase('configure');
    }

  const handleAccept = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (!result.success) {
        setError(result.error || 'Failed to save context');
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save context');
    } finally {
      setIsSaving(false);
    }


  const diffStats = phase === 'review' && editableContent
    ? getDiffStats(existingContent, editableContent)
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      aria-labelledby="regen-context-title"
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border-default">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
          </div>
          <h2 id="regen-context-title" className="text-lg font-semibold text-text-primary">
            Regenerate Context
          </h2>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
        {phase === 'configure' && (
          <StepScopeFeature
            description={description}
            onDescriptionChange={setDescription}
            repoPaths={repoPaths}
            repoDirectories={repoDirectories}
          />
        )}

        {phase === 'generate' && (
          <StepContextGeneration
            messages={messages}
            generatedContent={generatedContent}
            editableContent=""
            onContentChange={() => {}}
            error={error ?? genError}
            isGenerating={isGenerating}
          />
        )}

        {phase === 'review' && (
          <div className="space-y-4">
            {diffStats && (
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="text-success">+{diffStats.addedCount} added</span>
                <span className="text-danger">-{diffStats.removedCount} removed</span>
                <span>{diffStats.unchangedCount} unchanged</span>
                {!existingContent && (
                  <span className="text-text-muted">(new file)</span>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-muted text-danger text-sm">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {isEditing ? (
              <textarea
                value={editableContent}
                onChange={(e) => setEditableContent(e.target.value)}
                className="w-full min-h-[300px] max-h-[400px] px-3 py-2.5 text-xs font-mono bg-surface-2 border border-border-default rounded-lg text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
              />
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <DiffViewer
                  oldContent={existingContent}
                  newContent={editableContent}
                  autoScrollToFirstChange
                />
              </div>
            )}
          </div>
        )}
      </ModalBody>

      {/* Footer */}
      <ModalFooter>
        {phase === 'configure' && (
          <>
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!currentProjectId}
              className="btn btn-primary"
            >
              Generate
            </button>
          </>
        )}

        {phase === 'generate' && (
          <>
              </button>
            )}
            {isGenerating && (
              <button disabled className="btn btn-secondary">
                <LoadingSpinner className="w-4 h-4" />
                Generating...
              </button>
            )}
          </>
        )}

        {phase === 'review' && (
          <>
              Discard
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="btn btn-secondary"
            >
              {isEditing ? 'View Diff' : 'Edit'}
            </button>
            <button
              onClick={handleAccept}
              className="btn btn-primary"
            >
              {isSaving ? (
                <>
                  <LoadingSpinner className="w-4 h-4" />
                  Saving...
                </>
              ) : (
                'Accept & Save'
              )}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
