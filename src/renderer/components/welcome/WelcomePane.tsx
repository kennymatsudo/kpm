import { useCallback, useEffect, useState } from 'react';
import type { Project } from '../../../shared/types';
import { useClaudeAvailabilityStore } from '../../stores';
import { selectRepoPaths } from '../../services/repoService';
import { LoadingSpinner } from '../ui/LoadingButton';

interface WelcomePaneProps {
  projects: Project[];
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void;
  onCreateProjectFromRepos: (paths: string[]) => Promise<void>;
}

function KpmMarkIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16" />
      <path d="M4 12l7-8" />
      <path d="M4 12l7 8" />
      <path d="M14 4v16" />
      <path d="M14 12h6" />
    </svg>
  );
}

function FolderOpenIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
      />
    </svg>
  );
}

function claudeStatusLine(
  availability: ReturnType<typeof useClaudeAvailabilityStore.getState>['availability'],
  isLoading: boolean,
  error: string | null,
): { label: string; dotClassName: string } {
  if (isLoading && !availability) {
    return { label: 'Checking Claude Code…', dotClassName: 'bg-text-tertiary' };
  }
  if (!availability || error) {
    return { label: 'Sign in to Claude Code from your terminal to enable AI features', dotClassName: 'bg-warning' };
  }
  if (availability.status === 'bundled') {
    return { label: 'Claude Code connected', dotClassName: 'bg-success' };
  }
  if (availability.status === 'path-fallback') {
    return { label: 'Using system claude', dotClassName: 'bg-warning' };
  }
  return { label: 'Sign in with `claude` in your terminal to enable AI features', dotClassName: 'bg-warning' };
}

export function WelcomePane({ projects, onNewProject, onOpenProject, onCreateProjectFromRepos }: WelcomePaneProps) {
  const { availability, isLoading, error, load } = useClaudeAvailabilityStore();
  const [isOpeningRepo, setIsOpeningRepo] = useState(false);

  useEffect(() => {
    if (!availability && !isLoading) {
      void load();
    }
  }, [availability, isLoading, load]);

  const handleOpenRepo = useCallback(async () => {
    setIsOpeningRepo(true);
    try {
      const paths = await selectRepoPaths();
      if (paths.length > 0) {
        await onCreateProjectFromRepos(paths);
      }
    } finally {
      setIsOpeningRepo(false);
    }
  }, [onCreateProjectFromRepos]);

  const status = claudeStatusLine(availability, isLoading, error);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-surface-0">
      <div
        className="flex-1 grid place-items-center px-10 py-10 overflow-y-auto"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 40%, var(--color-surface-1) 0%, transparent 60%)',
        }}
      >
        <div className="w-[480px] max-w-full flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border-default grid place-items-center text-accent">
            <KpmMarkIcon />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-[20px] font-semibold tracking-tight text-text-primary">KPM</h1>
            <p className="text-[13px] leading-snug text-text-tertiary max-w-[380px] mx-auto">
              Plan, explore, and ship against your repos.
            </p>
          </div>

          {projects.length > 0 && (
            <div className="w-full">
              <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.1em] text-text-tertiary text-center">
                Projects
              </div>
              <div className="flex flex-col gap-1.5">
                {[...projects].reverse().slice(0, 6).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onOpenProject?.(project.id)}
                    className="text-left bg-surface-1 border border-border-subtle hover:border-border-strong rounded-lg px-3.5 py-2.5 transition-colors text-[13px] text-text-primary truncate"
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={handleOpenRepo}
              disabled={isOpeningRepo}
              className="flex items-center gap-1.5 rounded-md bg-accent text-surface-0 hover:bg-accent/90 disabled:opacity-60 px-3 py-1.5 text-[12px] font-medium transition-colors"
            >
              {isOpeningRepo ? <LoadingSpinner className="w-3.5 h-3.5" /> : <FolderOpenIcon className="w-3.5 h-3.5" />}
              Open a repository
            </button>
            <button
              onClick={onNewProject}
              className="rounded-md bg-surface-2 border border-border-subtle hover:border-border-default px-3 py-1.5 text-[12px] text-text-secondary transition-colors"
            >
              New project
            </button>
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-text-tertiary">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dotClassName}`} />
            {status.label}
          </div>
        </div>
      </div>
    </div>
  );
}
