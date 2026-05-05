import { useState, useCallback, useEffect } from 'react';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';
import { StepProjectInfo } from './StepProjectInfo';
import { StepScopeFeature } from './StepScopeFeature';
import { StepContextGeneration } from './StepContextGeneration';
import { useOnboardingEvents } from '../../hooks/useOnboardingEvents';
import { saveOnboardingContext } from '../../services/onboardingService';
import { useBackgroundTaskStore } from '../../stores/backgroundTaskStore';
import {
  startOnboardingTask,
  type OnboardingTaskMeta,
} from '../../services/onboardingTaskBridge';

interface ProjectOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * When set, skip the form phase and resume into the generating phase against
   * an existing task in the background task store. Used by the topbar badge to
   * re-enter a task that finished while the wizard was closed.
   */
  resumeTaskId?: string | null;
}

function basename(path: string): string {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function ProjectOnboardingWizard({
  isOpen,
  onClose,
  onCreate,
  resumeTaskId,
}: ProjectOnboardingWizardProps) {
  const [phase, setPhase] = useState<'form' | 'generating'>('form');
  const [name, setName] = useState('');
  const [nameWasUserEdited, setNameWasUserEdited] = useState(false);
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [repoDirectories, setRepoDirectories] = useState<Record<string, string[]>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    taskId,
    messages,
    generatedContent,
    error: genError,
    isGenerating,
    setActiveTaskId,
    reset: resetGeneration,
  } = useOnboardingEvents(resumeTaskId ?? null);

  // Resume entry: when the modal opens with a resumeTaskId, hydrate phase +
  // projectId from the store and skip the form.
  useEffect(() => {
    if (!isOpen || !resumeTaskId) return;
    const task = useBackgroundTaskStore.getState().tasks[resumeTaskId];
    if (!task) return;
    const meta = task.meta as OnboardingTaskMeta;
    setActiveTaskId(resumeTaskId);
    setProjectId(meta.projectId);
    setName(meta.projectName);
    setPhase('generating');
  }, [isOpen, resumeTaskId, setActiveTaskId]);

  // Hydrate editableContent from generatedContent once when generation completes
  useEffect(() => {
    if (generatedContent !== null && editableContent === '' && !isGenerating) {
      setEditableContent(generatedContent);
    }
  }, [generatedContent, editableContent, isGenerating]);

  const resetWizard = useCallback(() => {
    setPhase('form');
    setName('');
    setNameWasUserEdited(false);
    setRepoPaths([]);
    setDescription('');
    setRepoDirectories({});
    setProjectId(null);
    setEditableContent('');
    setError(null);
    setIsCreating(false);
    setIsSaving(false);
    resetGeneration();
  }, [resetGeneration]);

  // Closing during generation NO LONGER resets — the task continues in the
  // background store and the badge will surface it.
  const handleClose = useCallback(() => {
    if (isCreating || isSaving) return;
    if (isGenerating) {
      resetWizard();
      onClose();
      return;
    }
    resetWizard();
    onClose();
  }, [isCreating, isGenerating, isSaving, resetWizard, onClose]);

  const handleNameChange = useCallback((next: string) => {
    setName(next);
    setNameWasUserEdited(true);
    if (error) setError(null);
  }, [error]);

  const handleRepoPathsChange = useCallback((next: string[]) => {
    setRepoPaths(next);
    if (!nameWasUserEdited && !name.trim() && next.length > 0) {
      setName(basename(next[0]));
    }
  }, [name, nameWasUserEdited]);

      setError('Project name is required');
    }
    setError(null);

  const handleCreateOnly = useCallback(async () => {
    setIsCreating(true);
    try {
      resetWizard();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }

  const handleCreateAndGenerate = useCallback(async () => {
    setIsCreating(true);
    try {
      setProjectId(project.id);
      setPhase('generating');
      const newTaskId = await startOnboardingTask({
        projectId: project.id,
        description,
        repoDirectories,
        flow: 'create',
      });
      setActiveTaskId(newTaskId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
      setPhase('form');
    } finally {
      setIsCreating(false);
    }

  const handleRetry = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    setEditableContent('');
    const newTaskId = await startOnboardingTask({
      projectId,
      projectName: name || 'project',
      description,
      repoDirectories,
      flow: 'create',
    });
    setActiveTaskId(newTaskId);
  }, [projectId, name, description, repoDirectories, setActiveTaskId]);

  const handleSave = useCallback(async () => {
    if (!projectId || !editableContent.trim()) {
      if (taskId) useBackgroundTaskStore.getState().dismiss(taskId);
      resetWizard();
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveOnboardingContext(projectId, editableContent);
      if (!result.success) {
        setError(result.error || 'Failed to save project context');
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save project context');
      return;
    } finally {
      setIsSaving(false);
    }
    if (taskId) useBackgroundTaskStore.getState().dismiss(taskId);
    resetWizard();
    onClose();
  }, [projectId, editableContent, taskId, resetWizard, onClose]);

  const handleSkipSave = useCallback(() => {
    if (taskId) useBackgroundTaskStore.getState().dismiss(taskId);
    resetWizard();
    onClose();
  }, [taskId, resetWizard, onClose]);

  // Close-during-generation guard: only block on creating/saving, not on
  // generation itself (that releases to background).
  const closeBlocked = isCreating || isSaving;
  const hasGeneratedContent = generatedContent !== null && generatedContent.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      preventClose={closeBlocked}
      aria-labelledby="onboarding-title"
    >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            <svg
              className="w-4.5 h-4.5 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
          </div>
          <h2 id="onboarding-title" className="text-lg font-semibold text-text-primary">
            {phase === 'form' ? 'Create Project' : 'Project context'}
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

        {phase === 'form' && (
            <StepProjectInfo
              name={name}
              onNameChange={handleNameChange}
              repoPaths={repoPaths}
              onRepoPathsChange={handleRepoPathsChange}
              error={error}
              onErrorClear={() => setError(null)}
            />
            <StepScopeFeature
              description={description}
              onDescriptionChange={setDescription}
              repoPaths={repoPaths}
              repoDirectories={repoDirectories}
              onRepoDirectoriesChange={setRepoDirectories}
            />
          </div>
        )}

        {phase === 'generating' && (
          <StepContextGeneration
            messages={messages}
            generatedContent={generatedContent}
            editableContent={editableContent}
            onContentChange={setEditableContent}
            error={error ?? genError}
            isGenerating={isGenerating}
          />
        )}
      </ModalBody>

        {phase === 'form' && (
          <>
            <button onClick={handleClose} disabled={closeBlocked} className="btn btn-secondary">
              Cancel
            </button>
            {repoPaths.length > 0 && (
              <button
                onClick={handleCreateOnly}
                disabled={!name.trim() || closeBlocked}
                className="btn btn-secondary"
                title="Skip code scan"
              >
                {isCreating ? <LoadingSpinner className="w-4 h-4" /> : 'Skip generation'}
              </button>
            )}
            <button
              onClick={repoPaths.length > 0 ? handleCreateAndGenerate : handleCreateOnly}
              disabled={!name.trim() || closeBlocked}
              className="btn btn-primary"
            >
              {isCreating ? (
                <>
                  <LoadingSpinner className="w-4 h-4" />
                  Creating...
                </>
              ) : repoPaths.length > 0 ? (
                'Create & Generate'
              ) : (
                'Create project'
              )}
            </button>
          </>
        )}

        {phase === 'generating' && (
          <>
            {isGenerating && (
              <button
                onClick={handleClose}
                className="text-sm text-text-muted hover:text-text-primary transition-colors mr-auto"
                title="Generation continues in the background"
              >
                Continue in background
              </button>
            )}
            {!isGenerating && (
              <button
                onClick={handleSkipSave}
                disabled={isSaving}
                className="text-sm text-text-muted hover:text-text-primary transition-colors mr-auto"
              >
                Skip without saving
              </button>
            )}
            {!isGenerating && genError && (
              <button
                onClick={handleRetry}
                disabled={isSaving}
                className="btn btn-secondary"
              >
                Retry
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isGenerating || isSaving || !hasGeneratedContent || !editableContent.trim()}
              className="btn btn-primary"
            >
              {isSaving ? (
                <>
                  <LoadingSpinner className="w-4 h-4" />
                  Saving...
                </>
              ) : (
                'Save & Close'
              )}
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
