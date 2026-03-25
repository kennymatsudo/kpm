import { useState, useMemo } from 'react';
import { CloseIcon } from '../../icons';
import { LoadingSpinner } from '../../ui/LoadingButton';
import type { TrackerProjectRef } from '../../../stores/tracker/useMetadataStore';

interface Props {
  projects: TrackerProjectRef[];
  selectedProject: TrackerProjectRef | null;
  onSelect: (project: TrackerProjectRef | null) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Jira project selector with search.
 * Displays either the selected project (with clear button) or a searchable list.
 */
export function JiraProjectSelector({
  projects,
  selectedProject,
  onSelect,
  isLoading,
  error,
  onRetry,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = useMemo(() => {
    return projects.filter(p =>
      p.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [projects, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner className="w-6 h-6" color="info" />
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-2xl bg-danger-muted flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-text-muted text-sm mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm bg-surface-3 text-text-primary rounded-lg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
        Jira Project
      </label>
      {selectedProject ? (
        <div className="flex items-center gap-3 p-3 rounded-xl cursor-pointer group transition-all duration-150 bg-info-muted border border-info/30">
          <div className="w-8 h-8 rounded-lg bg-info/20 flex items-center justify-center flex-shrink-0">
            <span className="text-info font-bold text-xs">{selectedProject.key.slice(0, 2)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-text-primary">{selectedProject.key}</span>
            <span className="text-text-muted mx-2">·</span>
            <span className="text-sm text-text-secondary">{selectedProject.name}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mb-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-border-default rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-info/50 focus:bg-surface-1 transition-all duration-150"
            />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl bg-surface-2 border border-border-default">
            {filteredProjects.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-6">
                No projects match your search
              </p>
            ) : (
              <div className="p-1">
                {filteredProjects.map(project => (
                  <button
                    key={project.key}
                    onClick={() => onSelect(project)}
                    className="w-full text-left p-2.5 rounded-lg transition-all duration-150 hover:bg-surface-3 cursor-pointer group flex items-center gap-3"
                  >
                    <div className="w-7 h-7 rounded-md bg-surface-3 flex items-center justify-center flex-shrink-0 group-hover:bg-surface-2 transition-colors">
                      <span className="text-text-secondary font-semibold text-xs">{project.key.slice(0, 2)}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-sm text-text-primary mr-2">{project.key}</span>
                      <span className="text-text-muted text-sm truncate">{project.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
