import { memo } from 'react';
import { useProjectDomainStore, useSettingsUIStore } from '../../stores';

interface SidebarProps {
  onDeleteProject?: () => void;
  onNewProject?: () => void;
}

  return (
    <aside className="flex-1 sidebar flex flex-col overflow-hidden">
        {currentProjectId ? (
        ) : (
          <div className="p-6 text-center">
              </svg>
            </div>
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
