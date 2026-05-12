import type { KeyboardEvent, RefObject } from 'react';
import { MainViewSwitcher, type MainView } from './MainViewSwitcher';
import { useContextRegenerationStore } from '../../stores';
import { DropdownMenu } from '../ui/DropdownMenu';

interface ProjectOption {
  id: string;
  name: string;
  /** 1..10 for projects bound to ⌥⌘1..9 / ⌥⌘0; null when out of range. */
  shortcutPosition: number | null;
}

function formatProjectShortcut(position: number | null): string | null {
  if (position == null || position < 1 || position > 10) return null;
  const digit = position === 10 ? '0' : String(position);
  return `⌥⌘${digit}`;
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
  menuPos: DOMRect | null;
  buttonRef: RefObject<HTMLButtonElement | null>;
  setShowMenu: (show: boolean) => void;
  handleOpenMenu: () => void;
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
  menuPos,
  buttonRef,
  setShowMenu,
  handleOpenMenu,
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
  const currentProjectShortcut = currentProject
    ? formatProjectShortcut(currentProject.shortcutPosition)
    : null;

  return (
    <>
      <div className="flex items-center gap-1.5 no-drag" style={{ paddingLeft: 'var(--traffic-light-inset)' }}>
        <button
          onClick={onToggleSidebar}
          className={`p-1.5 rounded-lg transition-colors ${
            sidebarCollapsed
              ? 'text-text-muted hover:text-text-primary hover:bg-surface-3'
              : 'text-accent bg-accent/10 hover:bg-accent/20'
          }`}
          title={sidebarCollapsed ? 'Show sidebar (Cmd+B)' : 'Hide sidebar (Cmd+B)'}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 4h18v16H3V4zm6 0v16"
            />
          </svg>
        </button>

        {currentProject ? (
          isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onBlur={() => void handleSaveEdit()}
              onKeyDown={handleKeyDown}
              autoFocus
              className="input px-3 py-1.5 text-sm w-48"
            />
          ) : (
            <div className="flex items-center gap-2 relative">
              <button
                ref={buttonRef}
                onClick={handleOpenMenu}
                className={`flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-text-primary rounded-lg transition-colors ${
                  showMenu ? 'bg-surface-3' : 'hover:bg-surface-3'
                }`}
                aria-expanded={showMenu}
                aria-haspopup="menu"
                aria-label={`Project menu for ${currentProject.name}`}
              >
                <span>{currentProject.name}</span>
                <svg className="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <DropdownMenu
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                position={menuPos ? { type: 'anchor', anchor: menuPos } : null}
                minWidth={200}
              >
                {otherProjects.length > 0 && (
                  <>
                    <DropdownMenu.Submenu
                      trigger="Open Project"
                      icon={
                        <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      }
                      minWidth={200}
                    >
                      <DropdownMenu.SubmenuItem selected>
                        <span className="project-avatar">{currentProject.name.slice(0, 2)}</span>
                        <span className="flex-1">{currentProject.name}</span>
                        <span className="sr-only">(current project)</span>
                        {currentProjectShortcut && (
                          <kbd className="text-xxs px-1 py-0.5 rounded bg-surface-3 text-text-muted font-mono">
                            {currentProjectShortcut}
                          </kbd>
                        )}
                      </DropdownMenu.SubmenuItem>
                      <DropdownMenu.Separator />
                      {otherProjects.map((project) => {
                        const shortcut = formatProjectShortcut(project.shortcutPosition);
                        return (
                          <DropdownMenu.SubmenuItem
                            key={project.id}
                            onClick={() => handleOpenProject(project.id)}
                          >
                            <span className="project-avatar">{project.name.slice(0, 2)}</span>
                            <span className="flex-1">{project.name}</span>
                            {shortcut && (
                              <kbd className="text-xxs px-1 py-0.5 rounded bg-surface-3 text-text-muted font-mono">
                                {shortcut}
                              </kbd>
                            )}
                          </DropdownMenu.SubmenuItem>
                        );
                      })}
                    </DropdownMenu.Submenu>
                    <DropdownMenu.Separator />
                  </>
                )}

                {onNewProject && (
                  <DropdownMenu.Item
                    onClick={handleNewProject}
                    icon={
                      <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    }
                  >
                    New Project
                  </DropdownMenu.Item>
                )}

                <DropdownMenu.Separator />

                <DropdownMenu.Item
                  onClick={handleStartEdit}
                  icon={
                    <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  }
                >
                  Rename
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onClick={() => void handleOpenProjectFolder()}
                  icon={
                    <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  }
                >
                  Reveal in Finder
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onClick={handleCopyPath}
                  icon={
                    <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  }
                >
                  Copy Path
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onClick={handleCopyRelativePath}
                  icon={
                    <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  }
                >
                  Copy Relative Path
                </DropdownMenu.Item>

                <DropdownMenu.Separator />

                <DropdownMenu.Item
                  onClick={() => useContextRegenerationStore.getState().open()}
                  icon={
                    <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                    </svg>
                  }
                >
                  Regenerate Context
                </DropdownMenu.Item>

                <DropdownMenu.Separator />

                <DropdownMenu.Item
                  variant="danger"
                  onClick={handleDeleteClick}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  }
                >
                  Delete Project
                </DropdownMenu.Item>
              </DropdownMenu>
            </div>
          )
        ) : (
          <span className="text-sm text-text-muted">No project</span>
        )}
      </div>

      {currentProject && (
        <div className="flex items-center ml-3 no-drag">
          <MainViewSwitcher value={mainView} onChange={onMainViewChange} />
        </div>
      )}
    </>
  );
}
