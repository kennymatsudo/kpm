import { memo } from 'react';
import { useProjectDomainStore, useSettingsUIStore } from '../../stores';
import { ReposAndFilesSection } from '../sidebar-tree';
import { SettingsIcon } from '../icons';

interface SidebarProps {
  onDeleteProject?: () => void;
  onNewProject?: () => void;
  /**
   * Optional custom file open handler.
   * If provided, files are opened via this callback (e.g., workspace editor).
   * If not provided, markdown files open in viewer, others reveal in Finder.
   */
  onFileOpen?: (source: 'project', path: string, isEditable: boolean) => void;
}

export function Sidebar({ onDeleteProject: _onDeleteProject, onNewProject, onFileOpen }: SidebarProps) {

  return (
    <aside className="flex-1 sidebar flex flex-col overflow-hidden">
      {/* Main content area (scroll is managed inside section components) */}
        {currentProjectId ? (
          <ReposAndFilesSection projectId={currentProjectId} onFileOpen={onFileOpen} />
        ) : (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded bg-surface-2 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <p className="text-text-primary text-sm font-medium whitespace-nowrap">
              No project open
            </p>
            <p className="text-text-muted text-xs mt-1.5 leading-relaxed whitespace-nowrap">
            </p>
            {onNewProject && (
              <button
                onClick={onNewProject}
                className="btn btn-primary mt-4"
                data-testid="new-project-button"
              >
                New Project
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fixed footer with Settings */}
  );
