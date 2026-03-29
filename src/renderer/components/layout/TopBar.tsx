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
import { Z_INDEX } from '../../constants/zIndex';
import type { ViewMode } from '../planning/ViewSwitcher';
import type { StatusCategory, TrackerAssociationWithScope, TrackerCredentialInfo, TrackerType } from '../../../shared/types';
import { TopBarPlanningControls } from './TopBarPlanningControls';
import { TopBarProjectSection } from './TopBarProjectSection';
import { useProjectEdit } from './hooks/useProjectEdit';
import { useProjectMenu } from './hooks/useProjectMenu';
import { useTrackerTopBarIntegration } from './hooks/useTrackerTopBarIntegration';

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
  mainView,
  onMainViewChange,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  hiddenStatusCategories,
  onHiddenStatusCategoriesChange,
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
    setShowMenu,
    setShowDeleteConfirm,
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
        <TopBarProjectSection
          isEditing={isEditing}
          editName={editName}
          setEditName={setEditName}
          handleSaveEdit={handleSaveEdit}
          handleKeyDown={handleKeyDown}
          showMenu={showMenu}
          setShowMenu={setShowMenu}
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
                statusCounts={statusCounts}
              />

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

                  <button
                    onClick={handleTrackerClick}
                    aria-label={
                      !hasTrackerCredentials
                        ? `Open ${trackerLabel} setup`
                        : !hasAssociations
                          ? `Link ${trackerLabel} project`
                          : `Open ${trackerLabel} sync`
                    }
                  >
                    {queueCount > 0 && (
                        {queueCount > 99 ? '99+' : queueCount}
                      </span>
                    )}
                  </button>
              </div>
            </>
          )}

          {(mainView === 'planning' || mainView === 'workspace') && (
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
                This will delete all plan items, repos, and attachments associated with this project.
              </span>
            </>
          }
          action={{ label: 'Delete', variant: 'danger', onClick: handleConfirmDelete }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
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
