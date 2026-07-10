import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useProjectDomainStore,
  useBriefingStore,
  useCredentialStore,
  useExportStore,
  useSyncStore,
  useTrackerStore,
} from '../../stores';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { JiraIcon, LinearIcon } from '../icons';
import { Z_INDEX } from '../../constants/zIndex';
import { TrackerConfigDialog, TrackerLinkProjectDialog, SyncReviewPanel, SyncReviewModal, TypeMappingDialog, TrackerSyncPanel } from '../tracker';
import type { MainView } from './MainViewSwitcher';
import type { ViewMode } from '../planning/ViewSwitcher';
import type { StatusCategory, TrackerAssociationWithScope, TrackerCredentialInfo, TrackerType } from '../../../shared/types';
import { TopBarPlanningControls } from './TopBarPlanningControls';
import { TopBarProjectSection } from './TopBarProjectSection';
import { SlackTriageBadge, SlackTriagePanel } from '../slack';
import { CustomPromptTaskBadge } from './CustomPromptTaskBadge';
import { BackgroundTaskBadge } from '../background-tasks';
import { NotificationBadge } from '../notifications';
import { ONBOARDING_TASK_KIND } from '../../services/onboardingTaskBridge';
import { useProjectEdit } from './hooks/useProjectEdit';
import { useProjectMenu } from './hooks/useProjectMenu';
import { useTrackerTopBarIntegration } from './hooks/useTrackerTopBarIntegration';
import { Tooltip } from '../ui';
import type { PersonFilterOption } from './hooks/useLayoutPlanViewState';

interface TopBarProps {
  // Sidebar controls
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  chatCollapsed: boolean;
  onToggleChat: () => void;
  // Project controls
  onDeleteProject?: () => void;
  onNewProject?: () => void;
  onOpenProject?: (projectId: string) => void;
  onResumeOnboardingTask?: (taskId: string) => void;
  // Main view controls (workspace vs planning)
  mainView: MainView;
  onMainViewChange: (view: MainView) => void;
  // View controls (card/tree/board within planning)
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Filter controls
  searchQuery: string;
  onSearchChange: (query: string) => void;
  hiddenStatusCategories: Set<StatusCategory>;
  onHiddenStatusCategoriesChange: (categories: Set<StatusCategory>) => void;
  selectedPeopleFilterKeys: Set<string>;
  onSelectedPeopleFilterKeysChange: (keys: Set<string>) => void;
  personFilterOptions: PersonFilterOption[];
  // Selection state
  selectedItemCount: number;
  onClearSelection: () => void;
  // Status counts
  statusCounts: { total: number; visible: number };
  searchResultCount: number | undefined;
}

export function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  chatCollapsed,
  onToggleChat,
  onDeleteProject,
  onNewProject,
  onOpenProject,
  onResumeOnboardingTask,
  mainView,
  onMainViewChange,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  hiddenStatusCategories,
  onHiddenStatusCategoriesChange,
  selectedPeopleFilterKeys,
  onSelectedPeopleFilterKeysChange,
  personFilterOptions,
  selectedItemCount,
  onClearSelection,
  statusCounts,
  searchResultCount,
}: TopBarProps) {
  const { projects, currentProjectId, setProjects } = useProjectDomainStore(
    useShallow((state) => ({
      projects: state.projects,
      currentProjectId: state.currentProjectId,
      setProjects: state.setProjects,
    }))
  );
  const currentProject = projects.find((p) => p.id === currentProjectId) || null;
  // Projects are ordered oldest-first by ProjectRepository.list (created_at ASC).
  // ⌥⌘1 binds to the oldest project; new projects get the next-highest number
  // so existing bindings don't shift on create.
  const projectMenuOptions = projects.map((project, index) => ({
    id: project.id,
    name: project.name,
    shortcutPosition: index < 10 ? index + 1 : null,
  }));
  const currentProjectMenuOption = projectMenuOptions.find((p) => p.id === currentProjectId) ?? null;
  const otherProjectsMenuOptions = projectMenuOptions.filter((p) => p.id !== currentProjectId);
  const { selectedTrackerType } = useCredentialStore(
    useShallow((state) => ({ selectedTrackerType: state.selectedTrackerType }))
  );
  const trackerLabel = selectedTrackerType === 'jira' ? 'Jira' : 'Linear';

  const {
    isEditing,
    editName,
    setEditName,
    handleStartEdit,
    handleSaveEdit,
    handleKeyDown,
  } = useProjectEdit({ currentProject, currentProjectId, setProjects });

  const {
    showMenu,
    showDeleteConfirm,
    menuPos,
    buttonRef,
    setShowMenu,
    setShowDeleteConfirm,
    handleOpenMenu,
    handleDeleteClick,
    handleConfirmDelete,
    handleOpenProject,
    handleNewProject,
    handleOpenProjectFolder,
    handleCopyPath,
    handleCopyRelativePath,
  } = useProjectMenu({
    currentProject,
    currentProjectId,
    onDeleteProject,
    onNewProject,
    onOpenProject,
  });

  const {
    hasTrackerCredentials,
    trackerCredential,
    hasAssociations,
    associations,
    syncPanelAssociationId,
    setSyncPanelAssociationId,
    queueCount,
    handleTrackerClick,
    handleSyncComplete,
    handleExportComplete,
  } = useTrackerTopBarIntegration({ currentProjectId, trackerType: selectedTrackerType });

  return (
    <>
      <header className="h-10 flex items-center bg-surface-1 border-b border-border-subtle drag-region flex-shrink-0 relative overflow-visible" style={{ zIndex: Z_INDEX.panel - 10 }}>
        <TopBarProjectSection
          currentProject={currentProjectMenuOption}
          otherProjects={otherProjectsMenuOptions}
          isEditing={isEditing}
          editName={editName}
          setEditName={setEditName}
          handleSaveEdit={handleSaveEdit}
          handleKeyDown={handleKeyDown}
          showMenu={showMenu}
          menuPos={menuPos}
          buttonRef={buttonRef}
          setShowMenu={setShowMenu}
          handleOpenMenu={handleOpenMenu}
          handleOpenProject={handleOpenProject}
          handleNewProject={handleNewProject}
          handleStartEdit={handleStartEdit}
          handleOpenProjectFolder={handleOpenProjectFolder}
          handleCopyPath={handleCopyPath}
          handleCopyRelativePath={handleCopyRelativePath}
          handleDeleteClick={handleDeleteClick}
          onNewProject={onNewProject}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          mainView={mainView}
          onMainViewChange={onMainViewChange}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right section: View controls | Actions | Chat toggle (chrome) */}
        <div className="flex items-center gap-2 pr-3 no-drag min-w-0">
          {currentProject && (
            <>
              <TopBarPlanningControls
                isVisible={mainView === 'planning'}
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                selectedItemCount={selectedItemCount}
                onClearSelection={onClearSelection}
                searchQuery={searchQuery}
                onSearchChange={onSearchChange}
                searchResultCount={searchResultCount}
                hiddenStatusCategories={hiddenStatusCategories}
                onHiddenStatusCategoriesChange={onHiddenStatusCategoriesChange}
                selectedPeopleFilterKeys={selectedPeopleFilterKeys}
                onSelectedPeopleFilterKeysChange={onSelectedPeopleFilterKeysChange}
                personFilterOptions={personFilterOptions}
                statusCounts={statusCounts}
              />

              {/* Action buttons - independent toggles, no shared container */}
              <div className="flex items-center gap-1">
                {/* Briefing button - read-only context, small icon */}
                <Tooltip content="Project Briefing" side="bottom">
                  <button
                    onClick={() => {
                      useBriefingStore.getState().openModal();
                    }}
                    className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
                    aria-label="Project briefing"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </button>
                </Tooltip>

                {/* Slack triage button - conditional, small icon */}
                <SlackTriageBadge projectId={currentProjectId!} />

                {/* Tracker sync - mutating state with queue, labeled button */}
                <Tooltip
                  content={
                    !hasTrackerCredentials
                      ? `Connect ${trackerLabel}`
                      : !hasAssociations
                        ? `Link ${trackerLabel} Project`
                        : `${trackerLabel} Sync`
                  }
                  side="bottom"
                >
                  <button
                    onClick={handleTrackerClick}
                    className="relative flex items-center gap-1.5 pl-2 pr-2.5 h-7 rounded-md border border-border-subtle bg-surface-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-3 hover:border-border-default transition-colors"
                    aria-label={
                      !hasTrackerCredentials
                        ? `Open ${trackerLabel} setup`
                        : !hasAssociations
                          ? `Link ${trackerLabel} project`
                          : `Open ${trackerLabel} sync`
                    }
                  >
                    {selectedTrackerType === 'linear' ? (
                      <LinearIcon className="w-3.5 h-3.5" />
                    ) : (
                      <JiraIcon className="w-3.5 h-3.5" />
                    )}
                    <span>{trackerLabel}</span>
                    {queueCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-tiny font-semibold bg-accent text-white rounded-full">
                        {queueCount > 99 ? '99+' : queueCount}
                      </span>
                    )}
                  </button>
                </Tooltip>
              </div>
            </>
          )}

          {/* Cmd+K custom prompt indicator - persists across project switches */}
          <CustomPromptTaskBadge />

          {/* Generic background task indicator (onboarding generation, future kinds) */}
          <BackgroundTaskBadge
            resumeHandlers={{
              [ONBOARDING_TASK_KIND]: (task) => {
                if (onResumeOnboardingTask) onResumeOnboardingTask(task.id);
              },
            }}
          />

          {/* Generic notification bell (loop findings today, future event kinds later) */}
          <NotificationBadge />

          {/* Chat toggle - panel chrome, sits at the far right edge to mirror the sidebar toggle on the left */}
          {(mainView === 'planning' || mainView === 'workspace') && (
            <Tooltip content={chatCollapsed ? 'Show chat' : 'Hide chat'} side="bottom">
              <button
                onClick={onToggleChat}
                className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ml-1 ${
                  chatCollapsed
                    ? 'text-text-muted hover:text-text-primary hover:bg-surface-3'
                    : 'text-accent bg-accent/10 hover:bg-accent/20'
                }`}
                aria-label={chatCollapsed ? 'Expand chat panel' : 'Collapse chat panel'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </button>
            </Tooltip>
          )}
        </div>
      </header>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <ConfirmActionDialog
          title="Delete Project?"
          message={
            <>
              Are you sure you want to delete{' '}
              <span className="text-text-primary font-medium">"{currentProject?.name}"</span>?
              <br />
              <span className="text-warning text-xs mt-2 block">
                This removes the project from KPM, including its plan items and
                attachments, and disconnects any linked repos. Your repo folders
                and the code inside them are left untouched.
              </span>
            </>
          }
          action={{ label: 'Delete', variant: 'danger', onClick: handleConfirmDelete }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Slack triage panel */}
      {currentProjectId && (
        <SlackTriagePanel projectId={currentProjectId} />
      )}

      <TopBarTrackerOverlays
        currentProjectId={currentProjectId}
        selectedTrackerType={selectedTrackerType}
        trackerCredential={trackerCredential ?? null}
        associations={associations}
        syncPanelAssociationId={syncPanelAssociationId}
        onCloseSyncPanel={() => setSyncPanelAssociationId(null)}
        onSyncComplete={handleSyncComplete}
        onExportComplete={handleExportComplete}
      />
    </>
  );
}

const TopBarTrackerOverlays = memo(function TopBarTrackerOverlays({
  currentProjectId,
  selectedTrackerType,
  trackerCredential,
  associations,
  syncPanelAssociationId,
  onCloseSyncPanel,
  onSyncComplete,
  onExportComplete,
}: {
  currentProjectId: string | null;
  selectedTrackerType: TrackerType;
  trackerCredential: TrackerCredentialInfo | null;
  associations: TrackerAssociationWithScope[];
  syncPanelAssociationId: string | null;
  onCloseSyncPanel: () => void;
  onSyncComplete: () => Promise<void>;
  onExportComplete: () => Promise<void>;
}) {
  const { showCredentialsDialog, setShowCredentialsDialog } = useCredentialStore(
    useShallow((state) => ({
      showCredentialsDialog: state.showDialog,
      setShowCredentialsDialog: state.setShowDialog,
    }))
  );
  const { showAssociationDialog, setShowAssociationDialog } = useTrackerStore(
    useShallow((state) => ({
      showAssociationDialog: state.showAssociationDialog,
      setShowAssociationDialog: state.setShowAssociationDialog,
    }))
  );
  const { showSyncPanel, discardSync } = useSyncStore(
    useShallow((state) => ({
      showSyncPanel: state.showPanel,
      discardSync: state.discardSync,
    }))
  );
  const {
    showQueuePanel,
    showMappingDialog,
    exportActiveAssociationId,
    activeScopeId,
    setShowQueuePanel,
    setShowMappingDialog,
  } = useExportStore(
    useShallow((state) => ({
      showQueuePanel: state.showQueuePanel,
      showMappingDialog: state.showMappingDialog,
      exportActiveAssociationId: state.activeAssociationId,
      activeScopeId: state.activeScopeId,
      setShowQueuePanel: state.setShowQueuePanel,
      setShowMappingDialog: state.setShowMappingDialog,
    }))
  );

  return (
    <>
      {showCredentialsDialog && (
        <TrackerConfigDialog
          trackerType={selectedTrackerType}
          credential={trackerCredential}
          onClose={() => setShowCredentialsDialog(false)}
        />
      )}

      {showAssociationDialog && trackerCredential && (
        <TrackerLinkProjectDialog
          trackerType={selectedTrackerType}
          siteUrl={trackerCredential.site_url ?? ''}
          onClose={() => setShowAssociationDialog(false)}
        />
      )}

      {syncPanelAssociationId && (
        <TrackerSyncPanel associationId={syncPanelAssociationId} onClose={onCloseSyncPanel} />
      )}

      {showSyncPanel && currentProjectId && (
        <SyncReviewPanel
          projectId={currentProjectId}
          onClose={() => discardSync()}
          onSyncComplete={onSyncComplete}
        />
      )}

      {showQueuePanel && exportActiveAssociationId && currentProjectId && (
        <SyncReviewModal
          projectId={currentProjectId}
          associationId={exportActiveAssociationId}
          onClose={() => setShowQueuePanel(false)}
          onExportComplete={onExportComplete}
        />
      )}

      {showMappingDialog && activeScopeId && currentProjectId && (
        <TypeMappingDialog
          projectId={currentProjectId}
          scopeId={activeScopeId}
          projectKey={associations.find((a) => a.scope_id === activeScopeId)?.project_key ?? ''}
          onClose={() => setShowMappingDialog(false)}
        />
      )}
    </>
  );
});
