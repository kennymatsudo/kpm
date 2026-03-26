import { useState, useCallback, useEffect } from 'react';
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
