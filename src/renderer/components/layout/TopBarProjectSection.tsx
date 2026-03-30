import type { KeyboardEvent, RefObject } from 'react';
import { useContextRegenerationStore } from '../../stores';

interface ProjectOption {
  id: string;
  name: string;
}

interface TopBarProjectSectionProps {
  currentProject: ProjectOption | null;
  otherProjects: ProjectOption[];
  isEditing: boolean;
  editName: string;
  setEditName: (value: string) => void;
  handleSaveEdit: () => Promise<void>;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
  handleOpenProject: (projectId: string) => void;
  handleNewProject: () => void;
  handleStartEdit: () => void;
  handleOpenProjectFolder: () => Promise<void>;
  handleCopyPath: () => void;
  handleCopyRelativePath: () => void;
  handleDeleteClick: () => void;
  onNewProject?: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  mainView: MainView;
  onMainViewChange: (view: MainView) => void;
}

export function TopBarProjectSection({
  currentProject,
  otherProjects,
  isEditing,
  editName,
  setEditName,
  handleSaveEdit,
  handleKeyDown,
  showMenu,
  setShowMenu,
  handleOpenProject,
  handleNewProject,
  handleStartEdit,
  handleOpenProjectFolder,
  handleCopyPath,
  handleCopyRelativePath,
  handleDeleteClick,
  onNewProject,
  sidebarCollapsed,
  onToggleSidebar,
  mainView,
  onMainViewChange,
}: TopBarProjectSectionProps) {
  return (
    <>
        {currentProject ? (
          isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onBlur={() => void handleSaveEdit()}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
              <button
                aria-expanded={showMenu}
                aria-haspopup="menu"
                aria-label={`Project menu for ${currentProject.name}`}
              >
                <span>{currentProject.name}</span>
                <svg className="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

                    >
                      </svg>
                  >
                    </svg>
                    </svg>
                    </svg>
                    </svg>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    </svg>
            </div>
          )
        ) : (
        )}
      </div>

      {currentProject && (
          <MainViewSwitcher value={mainView} onChange={onMainViewChange} />
        </div>
      )}
    </>
  );
}
