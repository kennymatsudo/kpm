import { useState, useCallback } from 'react';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';
import { StepProjectInfo } from './StepProjectInfo';

export interface CreateProjectInput {
  name: string;
  repoPaths?: string[];
  folderPath?: string;
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<{ id: string }>;
}

function basename(path: string): string {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
}: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [nameWasUserEdited, setNameWasUserEdited] = useState(false);
  const [existingFolderPath, setExistingFolderPath] = useState('');
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setNameWasUserEdited(false);
    setExistingFolderPath('');
    setRepoPaths([]);
    setError(null);
    setIsCreating(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isCreating) return;
    resetForm();
    onClose();
  }, [isCreating, resetForm, onClose]);

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

  const handleExistingFolderChange = useCallback((next: string) => {
    setExistingFolderPath(next);
    if (!nameWasUserEdited && next) {
      const basename = next.split(/[/\\]/).filter(Boolean).pop();
      if (basename) setName(basename);
    }
    if (error) setError(null);
  }, [nameWasUserEdited, error]);

  const buildCreateInput = useCallback((): CreateProjectInput | null => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name is required');
      return null;
    }
    const trimmedExisting = existingFolderPath.trim();

    setError(null);
    return {
      name: trimmedName,
      repoPaths: repoPaths.length > 0 ? repoPaths : undefined,
      folderPath: trimmedExisting || undefined,
    };
  }, [name, existingFolderPath, repoPaths]);

  const handleCreate = useCallback(async () => {
    const input = buildCreateInput();
    if (!input) return;
    setIsCreating(true);
    try {
      await onCreate(input);
      resetForm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  }, [buildCreateInput, onCreate, resetForm, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      preventClose={isCreating}
      aria-labelledby="create-project-title"
      className="!flex !flex-col !overflow-hidden"
    >
      <div className="px-5 py-4 flex items-center justify-between border-b border-border-default shrink-0">
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
          <h2 id="create-project-title" className="text-lg font-semibold text-text-primary">
            Create Project
          </h2>
        </div>
        <button
          onClick={handleClose}
          disabled={isCreating}
          className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ModalBody className="flex-1 min-h-0 overflow-y-auto">
        <StepProjectInfo
          name={name}
          onNameChange={handleNameChange}
          existingFolderPath={existingFolderPath}
          onExistingFolderPathChange={handleExistingFolderChange}
          repoPaths={repoPaths}
          onRepoPathsChange={handleRepoPathsChange}
          error={error}
          onErrorClear={() => setError(null)}
        />
      </ModalBody>

      <ModalFooter className="shrink-0">
        <button onClick={handleClose} disabled={isCreating} className="btn btn-secondary">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || isCreating}
          className="btn btn-primary"
        >
          {isCreating ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Creating...
            </>
          ) : (
            'Create project'
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}
