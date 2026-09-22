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
import { RegenerateContextModal } from '../onboarding';
import { ToolLogPanel } from '../tool-log';
import { SettingsModal } from '../settings';
import { Z_INDEX } from '../../constants/zIndex';
import {
  useCommandPaletteStore,
  useProjectDomainStore,
  usePlanDomainStore,
  useProjectUiDomainStore,
  useToolLogStore,
  useSearchStore,
  useChatStore,
  useWorkspaceStore,
  useSettingsUIStore,
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

  const openCommandPalette = useCommandPaletteStore((state) => state.openCommandPalette);

  const planItems = usePlanDomainStore((state) => state.planItems);
  const isSwitchingProject = useProjectUiDomainStore((state) => state.isSwitchingProject);
  const isTerminalOpen = useTerminalStore((state) => state.isPanelOpen);
  const toggleTerminal = useTerminalStore((state) => state.togglePanel);

  // Extracted hooks
  const { sidebarWidth, chatWidth, handleSidebarResizeStart, handleChatResizeStart } = usePanelResize();
  const { mainView, setMainView } = usePersistedViewState(currentProjectId);
  const {
    chatCollapsed,
    workspaceChatCollapsed,
    handleToggleChat,
    showWorkspaceChat,
    showChatForCurrentView,
    hideChatForCurrentView,
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
    showChatForCurrentView,
    hideChatForCurrentView,
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
    const { isCommandPaletteOpen, closeCommandPalette } = useCommandPaletteStore.getState();
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

    // Cmd+W closes one document at a time, and only reaches the chat session
    // once the strip is empty.
    const { activeDocumentId, closeDocument } = useWorkspaceStore.getState();
    if (mainView === 'workspace' && activeDocumentId !== null) {
      void closeDocument(activeDocumentId);
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
    const { openDocuments, activeDocumentId } = useWorkspaceStore.getState();
    const active = openDocuments.find((document) => document.id === activeDocumentId);
    if (active?.path.toLowerCase().endsWith('.md')) {
      focus.open({
        path: active.path,
        title: getBaseName(active.path, 'Untitled'),
        content: active.content,
      });
    }
  }, []);

  // Tabs are ordered by session number, the same order the tab strip renders,
  // so cycling matches what the user sees. Wraps at both ends.
  const handleCycleChatSession = useCallback((direction: -1 | 1) => {
    const { sessions, viewedSessionId, setViewedSession } = useChatStore.getState();
    const ordered = Array.from(sessions.entries())
      .sort((a, b) => a[1].sessionNumber - b[1].sessionNumber)
      .map(([id]) => id);
    if (ordered.length < 2) return;
    const current = viewedSessionId ? ordered.indexOf(viewedSessionId) : -1;
    const next = ordered[(current + direction + ordered.length) % ordered.length];
    if (next) setViewedSession(next);
  }, []);

  // The strip renders in array order, so cycling matches what the user sees.
  // Wraps at both ends.
  const handleCycleDocument = useCallback((direction: -1 | 1) => {
    const { openDocuments, activeDocumentId, setActiveDocument } = useWorkspaceStore.getState();
    if (openDocuments.length < 2) return;
    const current = openDocuments.findIndex((document) => document.id === activeDocumentId);
    const next = openDocuments[(current + direction + openDocuments.length) % openDocuments.length];
    if (next) setActiveDocument(next.id);
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
    onCycleChatSession: handleCycleChatSession,
    onCycleDocument: handleCycleDocument,
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
          {/*
            Project switch progress. Deliberately a non-blocking bar rather than
            a modal scrim: the new project's data is fetched before the store
            swap, so the outgoing project stays usable and interruptible for the
            whole load — including going back to it.
          */}
          {isSwitchingProject && (
            <div
              className="project-switch-progress absolute top-0 left-0 right-0 h-0.5 pointer-events-none overflow-hidden"
              style={{ zIndex: 100 }}
              role="status"
              aria-label="Loading project"
            >
              <div className="project-switch-progress-bar h-full w-1/3 bg-accent" />
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
                style={{ zIndex: Z_INDEX.resizeHandle }}
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

        {currentProjectId && (
          <TerminalPanel projectId={currentProjectId} defaultCwd={terminalCwd} isOpen={isTerminalOpen} />
        )}

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
  const { isCommandPaletteOpen, closeCommandPalette } = useCommandPaletteStore(
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
