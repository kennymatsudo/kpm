import { memo, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sidebar } from '../sidebar';
import { PlanView } from '../planning';
import { WorkspaceView } from '../workspace';
import { TopBar } from './TopBar';
import { CommandPalette } from '../command-palette';

interface LayoutProps {
  onDeleteProject?: () => void;
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void;
  /** When true, sidebar floats over content instead of pushing it */
  sidebarOverlay?: boolean;
  /** When true, chat panel floats over content instead of pushing it */
  chatOverlay?: boolean;
}

  onDeleteProject,
  onNewProject,
  onOpenProject,
  sidebarOverlay = false,
  chatOverlay = false,
}: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Command palette state from artifacts store

  // Extracted hooks
  const { sidebarWidth, chatWidth, handleSidebarResizeStart, handleChatResizeStart } = usePanelResize();
  const { mainView, viewMode, setMainView, setViewMode } = usePersistedViewState(currentProjectId);
    openGlobalSearch(mainView === 'planning' ? 'plan_item' : 'document');
  // Keyboard shortcuts
  useLayoutShortcuts({
    onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
    onOpenCommandPalette: openCommandPalette,
  });

  return (
    <>
      <div className="flex flex-col h-screen bg-surface-0 text-text-primary">
        {/* Unified Top Bar */}
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          chatCollapsed={chatCollapsed}
          onDeleteProject={onDeleteProject}
          onOpenProject={onOpenProject}
          mainView={mainView}
          viewMode={viewMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hiddenStatusCategories={hiddenStatusCategories}
          onHiddenStatusCategoriesChange={setHiddenStatusCategories}
          selectedItemCount={selectedItemIds.size}
          statusCounts={statusCounts}
          searchResultCount={searchResultCount}
        />

        {/* Main content area - flex row with sidebar pushing content (or relative for overlay mode) */}
        <div className={`flex flex-1 overflow-hidden ${sidebarOverlay || chatOverlay ? 'relative' : ''}`}>
          {/* Project switching overlay */}
          {isSwitchingProject && (
                <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent spinner-refined" />
              </div>
            </div>
          )}

          {/* Left sidebar - pushes content by default, floats over when overlay mode */}
            <div
              className={
                sidebarOverlay
                  : 'flex flex-col bg-surface-0 flex-shrink-0 relative'
              }
            >
              <div className="flex-1 flex flex-col min-h-0">
                <ErrorBoundary name="Sidebar">
                  <Sidebar
                    onDeleteProject={onDeleteProject}
                    onNewProject={onNewProject}
                    onFileOpen={mainView === 'workspace' ? handleFileOpen : undefined}
                  />
                </ErrorBoundary>
              </div>
              {/* Sidebar resize handle */}
              <div
                onMouseDown={handleSidebarResizeStart}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            </div>
          )}

          {/* Main content area - fills remaining space between panels */}
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">

            {mainView === 'workspace' && currentProjectId && (
              <ErrorBoundary name="WorkspaceView">
              </ErrorBoundary>
            )}
          </main>

          {/* Right chat panel - only shown for planning view (workspace manages its own chat) */}
          {!chatCollapsed && mainView === 'planning' && (
            <div
              className={
                chatOverlay
                  : 'sidebar-panel flex bg-surface-0 flex-shrink-0'
              }
            >
              {/* Chat resize handle */}
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
              <div className="flex-1 panel-right flex flex-col min-w-0">
                  <ErrorBoundary name="Chat">
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <KeyboardShortcuts />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={closeCommandPalette} />
    </>
  );
