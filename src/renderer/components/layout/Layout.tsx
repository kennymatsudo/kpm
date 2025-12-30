import { memo, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PlanView } from '../planning';
import { TopBar } from './TopBar';
import { CommandPalette } from '../command-palette';

interface LayoutProps {
  onDeleteProject?: () => void;
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void;
}

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

          {/* Project switching overlay */}
          {isSwitchingProject && (
                <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent spinner-refined" />
              </div>
            </div>
          )}

            <div
            >
              {/* Sidebar resize handle */}
              <div
                onMouseDown={handleSidebarResizeStart}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            </div>
          )}

          <main className="flex-1 flex flex-col overflow-hidden min-w-0">

          </main>

            <div
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
