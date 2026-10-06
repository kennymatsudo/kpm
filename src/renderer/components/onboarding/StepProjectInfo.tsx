import { useRef, useCallback, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import type { FolderInspection } from '../../../shared/types';
import { CloseIcon, FileTextIcon, GitBranchIcon, WarningTriangleIcon } from '../icons';
import { selectRepoPaths } from '../../services/repoService';
import { selectProjectWorkspaceFolder } from '../../services/projectLoaderService';

interface StepProjectInfoProps {
  name: string;
  onNameChange: (name: string) => void;
  existingFolderPath: string;
  onExistingFolderPathChange: (path: string) => void;
  repoPaths: string[];
  onRepoPathsChange: (paths: string[]) => void;
  /** Where a project lands when no folder is picked; null until it loads. */
  managedProjectsRoot: string | null;
  /** Facts about the picked folder, or null when the field is empty. */
  folderInspection: FolderInspection | null;
  error: string | null;
  onErrorClear: () => void;
}

function shortenPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts.length >= 2 ? `~/${parts.slice(-2).join('/')}` : path;
}

export function StepProjectInfo({
  name,
  onNameChange,
  existingFolderPath,
  onExistingFolderPathChange,
  repoPaths,
  onRepoPathsChange,
  managedProjectsRoot,
  folderInspection,
  error,
  onErrorClear,
}: StepProjectInfoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderSectionOpen, setFolderSectionOpen] = useState(
    existingFolderPath.length > 0,
  );

  const handleBrowse = useCallback(async () => {
    const paths = await selectRepoPaths();
    if (paths.length > 0) {
      const newPaths = paths.filter((p: string) => !repoPaths.includes(p));
      onRepoPathsChange([...repoPaths, ...newPaths]);
    }
  }, [repoPaths, onRepoPathsChange]);

  const handleBrowseExisting = useCallback(async () => {
    const picked = await selectProjectWorkspaceFolder('Choose a folder for this project');
    if (picked) onExistingFolderPathChange(picked);
  }, [onExistingFolderPathChange]);

  const handleToggleFolderSection = useCallback(() => {
    setFolderSectionOpen(open => !open);
  }, []);

  const handleRemovePath = useCallback((pathToRemove: string) => {
    onRepoPathsChange(repoPaths.filter(p => p !== pathToRemove));
  }, [repoPaths, onRepoPathsChange]);

  const managedPathPreview = managedProjectsRoot
    ? `${managedProjectsRoot}/${(name.trim() || 'project').replace(/[^a-zA-Z0-9-_]/g, '-')}-…`
    : null;

  return (
    <div className="space-y-5">
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
          className="input"
          autoFocus
        />
      </div>

      {/* Repositories — the code KPM works against */}
      <div className="space-y-2">
        <div>
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
            <GitBranchIcon className="w-3.5 h-3.5 text-text-muted" />
            Code repositories
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
                <GitBranchIcon className="w-4 h-4 text-accent flex-shrink-0" />
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
            {repoPaths.length > 0 ? 'Add another repository...' : 'Add a repository...'}
          </button>
        </div>
      </div>

      {/* Where the project's own notes live — has a working default */}
      <div className="space-y-2 pt-1 border-t border-border-subtle">
        <button
          type="button"
          onClick={handleToggleFolderSection}
          className="mt-3 text-xs font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5 hover:text-text-primary transition-colors"
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
          <FileTextIcon className="w-3.5 h-3.5 text-text-muted" />
          Notes &amp; context
        </button>

        <p className="text-xs text-text-muted pl-[1.15rem]">
          Where this project&apos;s notes and its AGENTS.md live. Your code stays in the
          repositories above.
        </p>

        {!folderSectionOpen && managedPathPreview && (
          <p className="pl-[1.15rem] text-[11px] font-mono text-text-muted truncate" title={managedPathPreview}>
            {existingFolderPath.trim() || managedPathPreview}
          </p>
        )}

        {folderSectionOpen && (
          <div className="space-y-2 pl-[1.15rem] pt-1">
            <div className="flex gap-2">
              <input
                id="project-existing-folder"
                type="text"
                value={existingFolderPath}
                onChange={e => onExistingFolderPathChange(e.target.value)}
                placeholder={managedPathPreview ?? 'Leave empty to let KPM manage it'}
                className="input flex-1 font-mono text-sm"
                spellCheck={false}
                autoComplete="off"
                aria-describedby="project-folder-hint"
              />
              <button
                type="button"
                onClick={handleBrowseExisting}
                className="btn btn-secondary shrink-0"
              >
                Browse...
              </button>
            </div>

            <p id="project-folder-hint" className="text-[11px] text-text-muted">
              {folderInspectionHint(existingFolderPath, folderInspection)}
            </p>

            <AnimatePresence>
              {folderInspection?.isGitRepo && (
                <m.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning-muted text-warning text-xs"
                >
                  <WarningTriangleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    This folder is a git repository, so KPM&apos;s AGENTS.md will show up in its{' '}
                    <span className="font-mono">git status</span>. To work on its code, add it as
                    a repository above instead.
                  </span>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        )}
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

/** Tells the user what will happen to the folder they named, before they commit to it. */
function folderInspectionHint(rawPath: string, inspection: FolderInspection | null): string {
  if (!rawPath.trim()) return 'Empty means KPM creates and manages the folder for you.';
  if (!inspection) return 'Checking folder...';
  if (!inspection.exists) return 'Does not exist yet. KPM will create it.';
  if (!inspection.isDirectory) return 'This path is a file, not a folder. Pick a folder.';
  if (inspection.isEmpty) return 'Empty folder. KPM will add an AGENTS.md here.';
  return 'KPM will add an AGENTS.md here and leave your existing files alone.';
}
