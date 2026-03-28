import { create } from 'zustand';
import type { ToolPermission } from '../../shared/types';
import {
  listToolPermissions,
  revokeAllToolPermissions,
  revokeToolPermission,
} from '../services/permissionService';

interface ToolPermissionState {
  projectId: string | null;
  permissions: ToolPermission[];
  isLoading: boolean;
  isRevokingId: string | null;
  error: string | null;
  loadPermissions: (projectId: string) => Promise<void>;
  revokePermission: (permission: ToolPermission) => Promise<void>;
  revokeAll: (projectId: string) => Promise<void>;
  reset: () => void;
  resetProjectState: () => void;
}

const initialState = {
  projectId: null,
  permissions: [] as ToolPermission[],
  isLoading: false,
  isRevokingId: null,
  error: null as string | null,
};

export const useToolPermissionStore = create<ToolPermissionState>((set, get) => ({
  ...initialState,

  loadPermissions: async (projectId) => {
    set({ projectId, isLoading: true, error: null });

    try {
      const permissions = await listToolPermissions(projectId);
      if (get().projectId !== projectId) return;
      set({ permissions });
    } catch (error) {
      if (get().projectId !== projectId) return;
      set({
        permissions: [],
        error: error instanceof Error ? error.message : 'Failed to load tool permissions',
      });
    } finally {
      if (get().projectId === projectId) {
        set({ isLoading: false });
      }
    }
  },

  revokePermission: async (permission) => {
    set({ isRevokingId: permission.id, error: null });

    try {
      await revokeToolPermission(permission.id, permission.project_id, permission.cache_key);
      set((state) => ({
        permissions: state.permissions.filter((entry) => entry.id !== permission.id),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to revoke permission',
      });
      throw error;
    } finally {
      set({ isRevokingId: null });
    }
  },

  revokeAll: async (projectId) => {
    set({ error: null });

    try {
      await revokeAllToolPermissions(projectId);
      if (get().projectId === projectId) {
        set({ permissions: [] });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to revoke all permissions',
      });
      throw error;
    }
  },

  reset: () => set(initialState),
  resetProjectState: () => set(initialState),
}));
