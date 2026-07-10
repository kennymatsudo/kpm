import { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';
import { DiffViewer, getDiffStats } from '../ui/DiffViewer';
import { StepScopeFeature } from './StepScopeFeature';
import { StepContextGeneration } from './StepContextGeneration';
import { useOnboardingEvents } from '../../hooks/useOnboardingEvents';
import {
  getOnboardingContextDirectories,
  saveOnboardingContext,
  saveOnboardingContextDirectories,
} from '../../services/onboardingService';
import { readContextFile } from '../../services/contextFileService';
import { isPlaceholderContext } from '../../../shared/contextFile';
import type { OnboardingTaskMeta } from '../../services/onboardingTaskBridge';
import {
  useContextRegenerationStore,
  useProjectDomainStore,
  useResourceDomainStore,
  useBackgroundTaskStore,
} from '../../stores';

type Phase = 'configure' | 'generate' | 'review';

export function RegenerateContextModal() {
  const { isOpen, resumeTaskId, close } = useContextRegenerationStore(
    useShallow((s) => ({ isOpen: s.isOpen, resumeTaskId: s.resumeTaskId, close: s.close })),
  );
  const { currentProjectId, currentProjectName } = useProjectDomainStore(
    useShallow((s) => ({
      currentProjectId: s.currentProjectId,
      currentProjectName:
        s.projects.find((p) => p.id === s.currentProjectId)?.name ?? '',
    })),
  );
  const repos = useResourceDomainStore((s) => s.repos);

  const [phase, setPhase] = useState<Phase>('configure');
  const [description, setDescription] = useState('');
  const [repoDirectories, setRepoDirectories] = useState<Record<string, string[]>>({});
  const [existingContent, setExistingContent] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    taskId,
    messages,
    generatedContent,
    error: genError,
    isGenerating,
    startGeneration,
    setActiveTaskId,
    reset: resetGeneration,
  } = useOnboardingEvents(resumeTaskId ?? null);

  const repoPaths = repos.map((r) => r.path);
  const contextProjectId = targetProjectId ?? currentProjectId;

  // Resume entry: when modal opens with a resumeTaskId, hydrate from the store
  // and skip configure phase.
  useEffect(() => {
    if (!isOpen || !resumeTaskId) return;
    const task = useBackgroundTaskStore.getState().tasks[resumeTaskId];
    if (!task) return;
    const meta = task.meta as OnboardingTaskMeta;
    setActiveTaskId(resumeTaskId);
    setTargetProjectId(meta.projectId);
    setPhase('generate');
  }, [isOpen, resumeTaskId, setActiveTaskId]);

  // Load existing context file and persisted directories when modal opens
  useEffect(() => {
    if (isOpen && contextProjectId) {
      void readContextFile(contextProjectId).then((result) => {
        setExistingContent(result.success ? result.content : null);
      });
      void getOnboardingContextDirectories(contextProjectId).then((dirs) => {
        if (dirs) setRepoDirectories(dirs);
      });
    }
  }, [isOpen, contextProjectId]);

  const handleRepoDirectoriesChange = useCallback((nextRepoDirectories: Record<string, string[]>) => {
    setRepoDirectories(nextRepoDirectories);
    if (!contextProjectId) return;
    void saveOnboardingContextDirectories(contextProjectId, nextRepoDirectories);
  }, [contextProjectId]);

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
    setTargetProjectId(null);
    setIsEditing(false);
    setIsSaving(false);
    setError(null);
    resetGeneration();
  }, [resetGeneration]);

  // Hard close — used by Discard / Cancel / Accept. Dismisses the task from
  // the background store and closes the modal.
  const handleHardClose = useCallback(() => {
    if (taskId) useBackgroundTaskStore.getState().dismiss(taskId);
    resetModal();
    close();
  }, [taskId, resetModal, close]);

  // Soft close — used during generation. Modal disappears, task continues
  // running; the topbar badge will surface it.
  const handleBackgroundClose = useCallback(() => {
    resetGeneration();
    resetModal();
    close();
  }, [resetGeneration, resetModal, close]);

  // Modal X / outside click router: soft-close while generating, hard-close
  // otherwise. Saving is blocked entirely.
  const handleClose = useCallback(() => {
    if (isSaving) return;
    if (isGenerating) {
      handleBackgroundClose();
      return;
    }
    handleHardClose();
  }, [isGenerating, isSaving, handleBackgroundClose, handleHardClose]);

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId) return;
    const projectId = currentProjectId;
    setError(null);
    setTargetProjectId(projectId);
    setPhase('generate');
    try {
      await startGeneration({
        projectId,
        projectName: currentProjectName || 'project',
        description,
        repoDirectories,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
      setTargetProjectId(null);
      setPhase('configure');
    }
  }, [currentProjectId, currentProjectName, description, repoDirectories, startGeneration]);

  const handleAccept = useCallback(async () => {
    if (!contextProjectId || !editableContent.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveOnboardingContext(contextProjectId, editableContent);
      if (!result.success) {
        setError(result.error || 'Failed to save context');
        return;
      }
      handleHardClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save context');
    } finally {
      setIsSaving(false);
    }
  }, [contextProjectId, editableContent, handleHardClose]);

  // Saving is the only state we genuinely block close on; generation now
  // releases to the background, configure/review let the user discard.
  const closeBlocked = isSaving;

  const diffStats = phase === 'review' && editableContent
    ? getDiffStats(existingContent, editableContent)
    : null;

  const isFirstGeneration = existingContent === null || isPlaceholderContext(existingContent);
  const modalTitle = isFirstGeneration ? 'Generate Context' : 'Regenerate Context';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      preventClose={closeBlocked}
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
            {modalTitle}
          </h2>
        </div>
        <button
          onClick={handleClose}
          disabled={closeBlocked}
          className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <ModalBody className={phase === 'generate' ? 'flex flex-col min-h-[300px]' : ''}>
        {phase === 'configure' && (
          <StepScopeFeature
            description={description}
            onDescriptionChange={setDescription}
            repoPaths={repoPaths}
            repoDirectories={repoDirectories}
            onRepoDirectoriesChange={handleRepoDirectoriesChange}
          />
        )}

        {phase === 'generate' && (
          <StepContextGeneration
            messages={messages}
            generatedContent={generatedContent}
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
            <button onClick={handleHardClose} className="btn btn-secondary">
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
            {isGenerating && (
              <button
                onClick={handleBackgroundClose}
                className="text-sm text-text-muted hover:text-text-primary transition-colors mr-auto"
                title="Closes the modal. Generation continues in the background."
              >
                Continue in background
              </button>
            )}
            {isGenerating && (
              <button disabled className="btn btn-secondary">
                <LoadingSpinner className="w-4 h-4" />
                Generating...
              </button>
            )}
            {!isGenerating && (
              <button onClick={handleHardClose} className="btn btn-secondary">
                Cancel
              </button>
            )}
          </>
        )}

        {phase === 'review' && (
          <>
            <button onClick={handleHardClose} disabled={closeBlocked} className="btn btn-secondary">
              Discard
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              disabled={closeBlocked}
              className="btn btn-secondary"
            >
              {isEditing ? 'View Diff' : 'Edit'}
            </button>
            <button
              onClick={handleAccept}
              disabled={closeBlocked || !editableContent.trim()}
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
