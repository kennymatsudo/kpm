import { useRef, useCallback, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { CloseIcon } from '../icons';
import { selectRepoPaths } from '../../services/repoService';

interface StepProjectInfoProps {
  name: string;
  onNameChange: (name: string) => void;
  existingFolderPath: string;
  onExistingFolderPathChange: (path: string) => void;
  repoPaths: string[];
  onRepoPathsChange: (paths: string[]) => void;
  error: string | null;
  onErrorClear: () => void;
}

export function StepProjectInfo({
  name,
  onNameChange,
  existingFolderPath,
  onExistingFolderPathChange,
  repoPaths,
  onRepoPathsChange,
  error,
  onErrorClear,
}: StepProjectInfoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderSectionOpen, setFolderSectionOpen] = useState(
  );

  const handleBrowse = useCallback(async () => {
    const paths = await selectRepoPaths();
    if (paths.length > 0) {
      const newPaths = paths.filter((p: string) => !repoPaths.includes(p));
      onRepoPathsChange([...repoPaths, ...newPaths]);
    }
  }, [repoPaths, onRepoPathsChange]);

  const handleBrowseExisting = useCallback(async () => {
    const picked = await selectProjectParentFolder('Choose project folder');
    if (picked) onExistingFolderPathChange(picked);
  }, [onExistingFolderPathChange]);

  const handleToggleFolderSection = useCallback(() => {

  const handleRemovePath = useCallback((pathToRemove: string) => {
    onRepoPathsChange(repoPaths.filter(p => p !== pathToRemove));
  }, [repoPaths, onRepoPathsChange]);

  const shortenPath = (path: string) => {
    const parts = path.split(/[/\\]/);
    if (parts.length >= 2) {
      return `~/${parts.slice(-2).join('/')}`;
    }
    return path;
  };

  return (
    <div className="space-y-4">
      {/* Project Name */}
      <div className="space-y-2">
        <label
          htmlFor="project-name"
          className="block text-xs font-medium text-text-secondary uppercase tracking-wide"
        >
          Project Name
        </label>
        <input
          ref={inputRef}
          id="project-name"
          type="text"
          value={name}
          onChange={e => {
            onNameChange(e.target.value);
            if (error) onErrorClear();
          }}
          placeholder="My Feature"
          className="input input-bordered"
          autoFocus
        />
      </div>

      {/* Project folder (optional) */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleToggleFolderSection}
          className="text-xs font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5 hover:text-text-primary transition-colors"
          aria-expanded={folderSectionOpen}
        >
          <svg
            className={`w-3 h-3 transition-transform ${folderSectionOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          Project folder
        </button>

        {folderSectionOpen && (
          <div className="space-y-3 pl-4">
              >
                >
              </div>
          </div>
        )}
      </div>

      {/* Repositories */}
      <div className="space-y-2">
        <div>
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Connect repositories
          </span>
          <p className="text-xs text-text-muted mt-0.5 normal-case">
            Claude scans these folders locally, then sends selected context to the configured model.
          </p>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {repoPaths.map(path => (
              <m.div
                key={path}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent-subtle/60 rounded-lg"
              >
                <svg
                  className="w-4 h-4 text-accent flex-shrink-0"
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
                <span
                  className="flex-1 text-sm text-text-primary truncate font-mono"
                  title={path}
                >
                  {shortenPath(path)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemovePath(path)}
                  className="text-text-muted hover:text-text-primary p-0.5 rounded hover:bg-surface-3 transition-colors"
                  aria-label="Remove repository"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </m.div>
            ))}
          </AnimatePresence>

          <button
            type="button"
            onClick={handleBrowse}
            className="w-full px-4 py-2 bg-surface-2 border border-border-default border-dashed rounded-lg text-text-secondary text-sm hover:bg-surface-3 hover:border-border-strong hover:text-text-primary transition-default flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {repoPaths.length > 0 ? 'Add more folders...' : 'Browse folders...'}
          </button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-muted text-danger text-sm"
          >
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>{error}</span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
