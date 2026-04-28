import { memo, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sidebar } from '../sidebar';
import { PlanView } from '../planning';
import { WorkspaceView } from '../workspace';
import { Chat, ChatHeader } from '../chat';
import { TopBar } from './TopBar';
import { CommandPalette } from '../command-palette';
import { GlobalSearch } from '../global-search';
import { ApprovalOverlays } from './ApprovalOverlays';
import { ToastContainer } from '../ui';
import { BriefingModal } from '../briefing';
import { RegenerateContextModal } from '../onboarding';
import { ToolLogPanel } from '../tool-log';
import { Z_INDEX } from '../../constants/zIndex';
import {
  useArtifactsStore,
  useProjectDomainStore,
  usePlanDomainStore,
  useProjectUiDomainStore,
  useToolLogStore,
  useSearchStore,
} from '../../stores';
import { useToolLog } from '../../hooks/useToolLog';
import { useChatIpcBridge } from '../../hooks/useChatIpcBridge';
import { usePermissionIpcBridge } from '../../hooks/usePermissionIpcBridge';
import { useFileExplorerIpcBridge } from '../../hooks/useFileExplorerIpcBridge';
import { useDevSessionsSync } from '../../hooks/useDevSessionsSync';
import {
  useLayoutNavigationEffects,
  useLayoutPlanViewState,
  usePanelResize,
  useLayoutShortcuts,
  usePersistedChatCollapseState,
  usePersistedViewState,
} from './hooks';
import { logPerfEvent, startPerfSpan } from '../../utils/perfLogger';

interface LayoutProps {
  onDeleteProject?: () => void;
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void;
  /** When true, sidebar floats over content instead of pushing it */
  sidebarOverlay?: boolean;
  /** When true, chat panel floats over content instead of pushing it */
  chatOverlay?: boolean;
}

export const Layout = memo(function Layout({
  onDeleteProject,
  onNewProject,
  onOpenProject,
  sidebarOverlay = false,
  chatOverlay = false,
}: LayoutProps) {
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const projects = useProjectDomainStore((state) => state.projects);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Create item handler registered by PlanView (for Cmd+Shift+I)
  const [createItemHandler, setCreateItemHandler] = useState<(() => void) | null>(null);

  // Command palette state from artifacts store
  const openCommandPalette = useArtifactsStore((state) => state.openCommandPalette);

  const planItems = usePlanDomainStore((state) => state.planItems);
  const isSwitchingProject = useProjectUiDomainStore((state) => state.isSwitchingProject);

  // Extracted hooks
  const { sidebarWidth, chatWidth, handleSidebarResizeStart, handleChatResizeStart } = usePanelResize();
  const { mainView, viewMode, setMainView, setViewMode } = usePersistedViewState(currentProjectId);
  const {
    chatCollapsed,
    workspaceChatCollapsed,
    handleToggleChat,
    showWorkspaceChat,
  } = usePersistedChatCollapseState(currentProjectId, mainView);
  const {
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    hiddenStatusCategories,
    hiddenStatusCategoriesRef,
    setHiddenStatusCategories,
    selectedItemIds,
    setSelectedItemIds,
    clearSelectedItemIds,
    filteredPlannedItems,
    statusCounts,
    searchResultCount,
  } = useLayoutPlanViewState(currentProjectId, planItems);

  const handleMainViewChange = useCallback((view: typeof mainView) => {
    if (view === mainView) return;
    const end = startPerfSpan('view.main.switch', { from: mainView, to: view });
    setMainView(view);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => end());
    });
  }, [mainView, setMainView]);

  const handleViewModeChange = useCallback((mode: typeof viewMode) => {
    if (mode === viewMode) return;
    const end = startPerfSpan('view.mode.switch', { from: viewMode, to: mode });
    setViewMode(mode);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => end());
    });
  }, [setViewMode, viewMode]);

  // Tool log subscription - lives at Layout level so it never unmounts during view switches
  useToolLog(currentProjectId);

  // Chat IPC bridge - lives at Layout level so events are captured regardless of active view
  useChatIpcBridge(currentProjectId);

  // Permission IPC bridge - lives at Layout level so prompts are captured in all views
  usePermissionIpcBridge();

  // File explorer IPC bridge - centralizes filesystem event listeners
  useFileExplorerIpcBridge(currentProjectId);

  useDevSessionsSync(currentProjectId);

  // Register create item handler from PlanView
  const registerCreateItemHandler = useCallback((handler: (() => void) | null) => {
    setCreateItemHandler(() => handler);
  }, []);

  // Open create item modal (Cmd+Shift+I) - only when in planning view
  const handleOpenCreateItem = useCallback(() => {
    if (mainView === 'planning' && createItemHandler) {
      logPerfEvent('plan.item.create.open');
      createItemHandler();
    }
  }, [mainView, createItemHandler]);

  const { handleFileOpen } = useLayoutNavigationEffects({
    currentProjectId,
    hiddenStatusCategoriesRef,
    setHiddenStatusCategories,
    handleMainViewChange,
    showWorkspaceChat,
  });

  const handleToggleToolLog = useCallback(() => {
    useToolLogStore.getState().togglePanel();
  }, []);

  const handleSwitchProjectByPosition = useCallback((position: number) => {
    const project = projects[position - 1];
    if (!project || project.id === currentProjectId) return;
    onOpenProject?.(project.id);
  }, [projects, currentProjectId, onOpenProject]);

  // Global search
  const openGlobalSearch = useSearchStore((state) => state.openSearch);
  const handleOpenGlobalSearch = useCallback(() => {
    openGlobalSearch(mainView === 'planning' ? 'plan_item' : 'document');
  }, [openGlobalSearch, mainView]);

  // Keyboard shortcuts
  useLayoutShortcuts({
    onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
    onToggleChat: handleToggleChat,
    onMainViewChange: handleMainViewChange,
    onOpenCommandPalette: openCommandPalette,
    onCreateItem: handleOpenCreateItem,
    onToggleToolLog: handleToggleToolLog,
    onOpenGlobalSearch: handleOpenGlobalSearch,
    onSwitchProjectByPosition: handleSwitchProjectByPosition,
  });

  return (
    <>
      <div className="flex flex-col h-screen bg-surface-0 text-text-primary">
        {/* Unified Top Bar */}
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          chatCollapsed={chatCollapsed}
          onToggleChat={handleToggleChat}
          onDeleteProject={onDeleteProject}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          mainView={mainView}
          onMainViewChange={handleMainViewChange}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hiddenStatusCategories={hiddenStatusCategories}
          onHiddenStatusCategoriesChange={setHiddenStatusCategories}
          selectedItemCount={selectedItemIds.size}
          onClearSelection={clearSelectedItemIds}
          statusCounts={statusCounts}
          searchResultCount={searchResultCount}
        />

        {/* Main content area - flex row with sidebar pushing content (or relative for overlay mode) */}
        <div className={`flex flex-1 overflow-hidden ${sidebarOverlay || chatOverlay ? 'relative' : ''}`}>
          {/* Project switching overlay */}
          {isSwitchingProject && (
            <div className="project-switch-overlay absolute inset-0 bg-surface-0/50 backdrop-blur-sm flex items-center justify-center" style={{ zIndex: 100 }}>
              <div className="project-switch-content flex items-center gap-3 px-4 py-3 bg-surface-elevated rounded border border-border-strong">
                <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent spinner-refined" />
              </div>
            </div>
          )}

          {/* Left sidebar - pushes content by default, floats over when overlay mode */}
          {!sidebarCollapsed && (
            <div
              className={
                sidebarOverlay
                  ? `sidebar-left absolute left-0 top-0 bottom-0 flex flex-col bg-surface-0`
                  : 'flex flex-col bg-surface-0 flex-shrink-0 relative'
              }
              style={{ width: sidebarWidth, ...(sidebarOverlay ? { zIndex: Z_INDEX.panel } : {}) }}
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
                className="absolute right-0 top-0 bottom-0 w-px cursor-col-resize bg-border-subtle hover:bg-accent/50 active:bg-accent/70 transition-colors"
                style={{ zIndex: Z_INDEX.canvas.dragging }}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            </div>
          )}

          {/* Main content area - fills remaining space between panels */}
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            {mainView === 'planning' && (
              <div className="flex-1 flex flex-col min-h-0">
                <ErrorBoundary name="PlanView">
                  <PlanView
                    viewMode={viewMode}
                    filteredPlannedItems={filteredPlannedItems}
                    searchQuery={debouncedSearchQuery}
                    onSearchChange={setSearchQuery}
                    hiddenStatusCategories={hiddenStatusCategories}
                    onHiddenStatusCategoriesChange={setHiddenStatusCategories}
                    selectedItemIds={selectedItemIds}
                    setSelectedItemIds={setSelectedItemIds}
                    registerCreateItemHandler={registerCreateItemHandler}
                  />
                </ErrorBoundary>
              </div>
            )}

            {mainView === 'workspace' && currentProjectId && (
              <ErrorBoundary name="WorkspaceView">
                <WorkspaceView
                  projectId={currentProjectId}
                  chatCollapsed={workspaceChatCollapsed}
                  onShowChat={showWorkspaceChat}
                />
              </ErrorBoundary>
            )}
          </main>

          {/* Right chat panel - only shown for planning view (workspace manages its own chat) */}
          {!chatCollapsed && mainView === 'planning' && (
            <div
              className={
                chatOverlay
                  ? 'sidebar-panel sidebar-right absolute right-0 top-0 bottom-0 flex bg-surface-0'
                  : 'sidebar-panel flex bg-surface-0 flex-shrink-0'
              }
              style={{ width: chatWidth, ...(chatOverlay ? { zIndex: Z_INDEX.panel } : {}) }}
            >
              {/* Chat resize handle */}
              <div
                onMouseDown={handleChatResizeStart}
                className="relative w-px cursor-col-resize flex-shrink-0 bg-border-subtle hover:bg-accent/50 active:bg-accent/70 transition-colors"
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
              <div className="flex-1 panel-right flex flex-col min-w-0">
                <ChatHeader />
                  <ErrorBoundary name="Chat">
                    <Chat currentView="plan" />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
      <LayoutOverlays currentProjectId={currentProjectId} />
    </>
  );
});

const LayoutOverlays = memo(function LayoutOverlays({
}: {
  currentProjectId: string | null;
}) {
  const isToolLogOpen = useToolLogStore((state) => state.isPanelOpen);
  const { isCommandPaletteOpen, closeCommandPalette } = useArtifactsStore(
    useShallow((state) => ({
      isCommandPaletteOpen: state.isCommandPaletteOpen,
      closeCommandPalette: state.closeCommandPalette,
    }))
  );

  return (
    <>
      {isToolLogOpen && <ToolLogPanel />}
      <KeyboardShortcuts />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={closeCommandPalette} />
      <GlobalSearch />
      <ApprovalOverlays />
      <BriefingModal />
      <RegenerateContextModal />
      <ToastContainer />
    </>
  );
});
