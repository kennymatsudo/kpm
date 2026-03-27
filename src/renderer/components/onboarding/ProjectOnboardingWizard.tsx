import { useState, useCallback, useEffect } from 'react';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';
import { StepProjectInfo } from './StepProjectInfo';
import { StepScopeFeature } from './StepScopeFeature';
import { StepContextGeneration } from './StepContextGeneration';
import { useOnboardingEvents } from '../../hooks/useOnboardingEvents';

interface ProjectOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

  const [name, setName] = useState('');
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [repoDirectories, setRepoDirectories] = useState<Record<string, string[]>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    messages,
    generatedContent,
    error: genError,
    isGenerating,
    reset: resetGeneration,

  useEffect(() => {
    if (generatedContent !== null && editableContent === '' && !isGenerating) {
      setEditableContent(generatedContent);
    }
  }, [generatedContent, editableContent, isGenerating]);

  const resetWizard = useCallback(() => {
    setName('');
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

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [isCreating, isGenerating, isSaving, resetWizard, onClose]);

      setError('Project name is required');
    }
    setError(null);

    setIsCreating(true);
    try {
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }

    setIsCreating(true);
    try {
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }

  const handleSave = useCallback(async () => {
    if (!projectId || !editableContent.trim()) {
      resetWizard();
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
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
    resetWizard();
    onClose();

    resetWizard();
    onClose();


  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
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
          </h2>
        </div>
      </div>

        )}

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

          <>
              Cancel
            </button>
            <button
              className="btn btn-primary"
            >
              {isCreating ? (
                <>
                  <LoadingSpinner className="w-4 h-4" />
                  Creating...
                </>
              ) : (
              )}
            </button>
          </>
        )}

          <>
            {!isGenerating && (
              <button
                className="btn btn-secondary"
              >
              </button>
            )}
            <button
              onClick={handleSave}
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
