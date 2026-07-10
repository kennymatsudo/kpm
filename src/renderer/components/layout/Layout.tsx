import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sidebar } from '../sidebar';
import { PlanView } from '../planning';
import { WorkspaceView } from '../workspace';
import { WelcomePane } from '../welcome/WelcomePane';
import { ChatPanel } from '../chat/ChatPanel';
import { TopBar } from './TopBar';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { KeyboardShortcuts } from '../keyboard-shortcuts/KeyboardShortcuts';
import { CommandPalette } from '../command-palette';
import { GlobalSearch } from '../global-search';
import { ApprovalOverlays } from './ApprovalOverlays';
import { FocusMode } from '../focus-mode/FocusMode';
import { ToastContainer } from '../ui';
import { BriefingModal } from '../briefing';
import { RegenerateContextModal } from '../onboarding';
import { ToolLogPanel } from '../tool-log';
import { SettingsModal } from '../settings';
import { Z_INDEX } from '../../constants/zIndex';
import {
  useArtifactsStore,
  useProjectDomainStore,
  usePlanDomainStore,
  useProjectUiDomainStore,
  useToolLogStore,
  useSearchStore,
  useChatStore,
  useWorkspaceStore,
  useSettingsUIStore,
  useBriefingStore,
  useTerminalStore,
  useFocusModeStore,
} from '../../stores';
import { getBaseName } from '../../utils/path';
import { TerminalPanel } from '../terminal';
import { cancelChatSession, disconnectChatSession } from '../../services/chatService';
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
  onResumeOnboardingTask?: (taskId: string) => void;
  onCreateProjectFromRepos?: (paths: string[]) => Promise<void>;
}

export const Layout = memo(function Layout({
  onDeleteProject,
  onNewProject,
  onOpenProject,
  onResumeOnboardingTask,
  onCreateProjectFromRepos,
}: LayoutProps) {
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const projects = useProjectDomainStore((state) => state.projects);

  // Collapse the sidebar when no project is open — its empty state duplicates
  // the WelcomePane. Re-derive on project open/close transitions, but leave a
  // manual toggle in between untouched.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => !currentProjectId);
  const hadProjectRef = useRef(Boolean(currentProjectId));
  useEffect(() => {
    const hasProject = Boolean(currentProjectId);
    if (hasProject !== hadProjectRef.current) {
      hadProjectRef.current = hasProject;
      setSidebarCollapsed(!hasProject);
    }
  }, [currentProjectId]);

  // Create item handler registered by PlanView (for Cmd+Shift+I)
  const [createItemHandler, setCreateItemHandler] = useState<(() => void) | null>(null);

  // Command palette state from artifacts store
  const openCommandPalette = useArtifactsStore((state) => state.openCommandPalette);

  const planItems = usePlanDomainStore((state) => state.planItems);
  const isSwitchingProject = useProjectUiDomainStore((state) => state.isSwitchingProject);
  const isTerminalOpen = useTerminalStore((state) => state.isPanelOpen);
  const toggleTerminal = useTerminalStore((state) => state.togglePanel);

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
    selectedPeopleFilterKeys,
    setSelectedPeopleFilterKeys,
    personFilterOptions,
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

  const handleToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);

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

  // Cmd+W: close focused context (overlays > file editor > chat session)
  const handleClose = useCallback(() => {
    const { isCommandPaletteOpen, closeCommandPalette } = useArtifactsStore.getState();
    if (isCommandPaletteOpen) {
      closeCommandPalette();
      return;
    }

    const { isOpen: isSearchOpen, closeSearch } = useSearchStore.getState();
    if (isSearchOpen) {
      closeSearch();
      return;
    }

    const { isOpen: isSettingsOpen, setIsOpen: setSettingsOpen } = useSettingsUIStore.getState();
    if (isSettingsOpen) {
      setSettingsOpen(false);
      return;
    }

    const { isModalOpen: isBriefingOpen, closeModal: closeBriefing } = useBriefingStore.getState();
    if (isBriefingOpen) {
      closeBriefing();
      return;
    }

    const { editingFile, closeEditor } = useWorkspaceStore.getState();
    if (mainView === 'workspace' && editingFile !== null) {
      closeEditor();
      return;
    }

    const chatState = useChatStore.getState();
    const { viewedSessionId, sessions, activeSessionIds } = chatState;
    if (viewedSessionId) {
      const session = sessions.get(viewedSessionId);
      void (async () => {
        if (currentProjectId && session) {
          if (activeSessionIds.has(viewedSessionId) && session.isStreaming) {
            await cancelChatSession(currentProjectId, viewedSessionId);
          }
          if (activeSessionIds.has(viewedSessionId)) {
            await disconnectChatSession(currentProjectId, viewedSessionId);
          }
        }
        chatState.removeSession(viewedSessionId);
      })();
      return;
    }

  }, [mainView, currentProjectId]);

  // Resolve cwd for new terminals: the KPM project folder when one is active,
  // otherwise TerminalService falls back to the user's home directory.
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const terminalCwd = currentProject?.folder_path;

  // Toggle the focus reader: close it if open, otherwise open it for the
  // markdown document currently in the workspace editor (no-op if none).
  const handleToggleFocusMode = useCallback(() => {
    const focus = useFocusModeStore.getState();
    if (focus.isOpen) {
      focus.close();
      return;
    }
    const editing = useWorkspaceStore.getState().editingFile;
    if (editing?.path.toLowerCase().endsWith('.md')) {
      focus.open({
        path: editing.path,
        title: getBaseName(editing.path, 'Untitled'),
        content: editing.content,
      });
    }
  }, []);

  // Keyboard shortcuts
  useLayoutShortcuts({
    onToggleSidebar: handleToggleSidebar,
    onToggleChat: handleToggleChat,
    onMainViewChange: handleMainViewChange,
    onOpenCommandPalette: openCommandPalette,
    onCreateItem: handleOpenCreateItem,
    onToggleToolLog: handleToggleToolLog,
    onOpenGlobalSearch: handleOpenGlobalSearch,
    onToggleTerminal: toggleTerminal,
    onSwitchProjectByPosition: handleSwitchProjectByPosition,
    onToggleFocusMode: handleToggleFocusMode,
    onClose: handleClose,
  });

  return (
    <>
      <div className="flex flex-col h-screen bg-surface-0 text-text-primary">
        {/* Unified Top Bar */}
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          chatCollapsed={chatCollapsed}
          onToggleChat={handleToggleChat}
          onDeleteProject={onDeleteProject}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onResumeOnboardingTask={onResumeOnboardingTask}
          mainView={mainView}
          onMainViewChange={handleMainViewChange}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hiddenStatusCategories={hiddenStatusCategories}
          onHiddenStatusCategoriesChange={setHiddenStatusCategories}
          selectedPeopleFilterKeys={selectedPeopleFilterKeys}
          onSelectedPeopleFilterKeysChange={setSelectedPeopleFilterKeys}
          personFilterOptions={personFilterOptions}
          selectedItemCount={selectedItemIds.size}
          onClearSelection={clearSelectedItemIds}
          statusCounts={statusCounts}
          searchResultCount={searchResultCount}
        />

        {/* Main content area - flex row with sidebar pushing content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Project switching overlay */}
          {isSwitchingProject && (
            <div className="project-switch-overlay absolute inset-0 bg-surface-0/50 backdrop-blur-sm flex items-center justify-center" style={{ zIndex: 100 }}>
              <div className="project-switch-content flex items-center gap-3 px-4 py-3 bg-surface-elevated rounded border border-border-strong">
                <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent spinner-refined" />
                <span className="text-sm font-medium text-text-primary tracking-tight">Loading project</span>
              </div>
            </div>
          )}

          {/* Left sidebar - pushes content */}
          {!sidebarCollapsed && (
            <div
              className="flex flex-col bg-surface-0 flex-shrink-0 relative"
              style={{ width: sidebarWidth }}
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

            {mainView === 'workspace' && !currentProjectId && onCreateProjectFromRepos && (
              <ErrorBoundary name="WelcomePane">
                <WelcomePane
                  projects={projects}
                  onNewProject={onNewProject}
                  onOpenProject={onOpenProject}
                  onCreateProjectFromRepos={onCreateProjectFromRepos}
                />
              </ErrorBoundary>
            )}
          </main>

          {/* Right chat panel - only shown for planning view (workspace manages its own chat) */}
          {!chatCollapsed && mainView === 'planning' && (
            <div
              className="sidebar-panel flex bg-surface-0 flex-shrink-0"
              style={{ width: chatWidth }}
            >
              {/* Chat resize handle */}
              <div
                onMouseDown={handleChatResizeStart}
                className="relative w-px cursor-col-resize flex-shrink-0 bg-border-subtle hover:bg-accent/50 active:bg-accent/70 transition-colors"
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
              <ChatPanel view="plan" className="flex-1" />
            </div>
          )}
        </div>

        <TerminalPanel defaultCwd={terminalCwd} isOpen={isTerminalOpen} />

      </div>
      <LayoutOverlays currentProjectId={currentProjectId} />
    </>
  );
});

const LayoutOverlays = memo(function LayoutOverlays({
  currentProjectId,
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
  const { isSettingsOpen, setSettingsOpen } = useSettingsUIStore(
    useShallow((state) => ({ isSettingsOpen: state.isOpen, setSettingsOpen: state.setIsOpen }))
  );

  return (
    <>
      {isToolLogOpen && <ToolLogPanel />}
      <KeyboardShortcuts />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={closeCommandPalette} />
      <GlobalSearch />
      <FocusMode />
      <ApprovalOverlays />
      <BriefingModal />
      <RegenerateContextModal />
      <ToastContainer />
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          currentProjectId={currentProjectId}
        />
      )}
    </>
  );
});
