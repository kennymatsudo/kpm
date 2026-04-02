import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LoadingSpinner } from '../ui/LoadingButton';
import { useToolPermissionStore } from '../../stores';
import { SettingsSection, StatusBadge } from './SettingsSection';
import type { ToolPermission } from '../../../shared/types';

interface Props {
  currentProjectId: string;
}

export function PermissionsSettings({ currentProjectId }: Props) {
  const {
    permissions,
    isLoading,
    isRevokingId,
    error,
    loadPermissions,
    revokePermission,
    revokeAll,
  } = useToolPermissionStore(
    useShallow((state) => ({
      permissions: state.permissions,
      isLoading: state.isLoading,
      isRevokingId: state.isRevokingId,
      error: state.error,
      loadPermissions: state.loadPermissions,
      revokePermission: state.revokePermission,
      revokeAll: state.revokeAll,
    }))
  );

  useEffect(() => {
    void loadPermissions(currentProjectId);
  }, [currentProjectId, loadPermissions]);

  const handleRevoke = async (permission: ToolPermission) => {
    await revokePermission(permission);
  };

  const handleRevokeAll = async () => {
    await revokeAll(currentProjectId);
  };

  return (
    <div className="space-y-4">
      <SettingsSection
        icon={
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        }
        title="Tool Permissions"
        description="Saved approvals for Claude tools in this project"
        collapsible={false}
        statusBadge={
          !isLoading && permissions.length > 0 ? (
            <StatusBadge variant="muted">{permissions.length} permission{permissions.length !== 1 ? 's' : ''}</StatusBadge>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {error && (
            <div className="text-sm text-danger">{error}</div>
          )}
          {isLoading ? (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <LoadingSpinner className="w-4 h-4" />
              <span>Loading...</span>
            </div>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-text-muted">No saved permissions</p>
          ) : (
            <>
              <div className="space-y-1">
                {permissions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-text-secondary">{p.tool_name}</span>
                      <p className="text-xs text-text-muted truncate">{p.label}</p>
                    </div>
                    <button
                      onClick={() => handleRevoke(p)}
                      disabled={isRevokingId === p.id}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-danger hover:bg-danger-muted/50 rounded-md transition-all disabled:opacity-50"
                    >
                      {isRevokingId === p.id ? (
                        <LoadingSpinner className="w-3 h-3" />
                      ) : (
                        'Revoke'
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-1">
                <button
                  onClick={handleRevokeAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-danger hover:bg-danger-muted/50 rounded-lg transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  <span>Revoke All</span>
                </button>
              </div>
            </>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
