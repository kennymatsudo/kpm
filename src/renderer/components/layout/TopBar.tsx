import { useShallow } from 'zustand/react/shallow';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { Z_INDEX } from '../../constants/zIndex';

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
    useShallow((state) => ({
      projects: state.projects,
      currentProjectId: state.currentProjectId,
    }))
  );
  const currentProject = projects.find((p) => p.id === currentProjectId) || null;


  const {

  const {
    associations,
    queueCount,

  return (
    <>

        {/* Spacer */}
        <div className="flex-1" />

          {currentProject && (
            <>

            </>
          )}

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

      {showCredentialsDialog && (
      )}

          onClose={() => setShowAssociationDialog(false)}
        />
      )}

      )}

      {showSyncPanel && currentProjectId && (
        <SyncReviewPanel
          projectId={currentProjectId}
          onClose={() => discardSync()}
        />
      )}

      {showQueuePanel && exportActiveAssociationId && currentProjectId && (
        <SyncReviewModal
          projectId={currentProjectId}
          associationId={exportActiveAssociationId}
          onClose={() => setShowQueuePanel(false)}
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
