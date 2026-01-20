/**
 * Group Store
 *
 * State management for visual group containers (Figma-style frames).
 * Groups are purely visual - they organize plan items without affecting hierarchy.
 */

import { create } from 'zustand';
import type { Group } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================


interface GroupState {
  // Groups
  groups: Group[];
  isLoading: boolean;
  error: string | null;

  // State setters
  setGroups: (groups: Group[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Group operations
  addGroup: (group: Group) => void;
  updateGroup: (id: string, updates: GroupUpdates) => void;
  removeGroup: (id: string) => void;

  // Async operations
  loadGroups: (projectId: string) => Promise<void>;
  createGroup: (projectId: string, name: string, options?: {
    color?: string;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }) => Promise<Group | null>;
  saveGroupUpdates: (id: string, updates: GroupUpdates) => Promise<boolean>;
  deleteGroup: (id: string) => Promise<boolean>;
  updateGroupPosition: (id: string, x: number, y: number) => Promise<boolean>;
  updateGroupSize: (id: string, width: number, height: number) => Promise<boolean>;
  assignItemToGroup: (itemId: string, groupId: string | null) => Promise<boolean>;

  // Reset
  reset: () => void;
  resetProjectState: () => void;
}

// =============================================================================
// Store
// =============================================================================

const initialState = {
  groups: [],
  isLoading: false,
  error: null,
};

export const useGroupStore = create<GroupState>((set, get) => ({
  ...initialState,

  // State setters
  setGroups: (groups) => set({ groups }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Group operations
  addGroup: (group) =>
    set((state) => ({
      groups: [...state.groups, group],
    })),

  updateGroup: (id, updates) =>
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === id ? { ...group, ...updates } : group
      ),
    })),

  removeGroup: (id) =>
    set((state) => ({
      groups: state.groups.filter((group) => group.id !== id),
    })),

  // Async operations
  loadGroups: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      set({ groups, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load groups',
        isLoading: false,
      });
    }
  },

  createGroup: async (projectId, name, options) => {
    try {
      get().addGroup(group);
      return group;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create group',
      });
      return null;
    }
  },

  saveGroupUpdates: async (id, updates) => {
    // Optimistic update
    const previousGroups = get().groups;
    get().updateGroup(id, updates);

    try {
      if (!result.success) {
        // Revert on failure
        set({ groups: previousGroups, error: result.error || 'Failed to update group' });
        return false;
      }
      return true;
    } catch (error) {
      // Revert on error
      set({
        groups: previousGroups,
        error: error instanceof Error ? error.message : 'Failed to update group',
      });
      return false;
    }
  },

  deleteGroup: async (id) => {
    // Optimistic update
    const previousGroups = get().groups;
    get().removeGroup(id);

    try {
      if (!result.success) {
        // Revert on failure
        set({ groups: previousGroups, error: result.error || 'Failed to delete group' });
        return false;
      }
      return true;
    } catch (error) {
      // Revert on error
      set({
        groups: previousGroups,
        error: error instanceof Error ? error.message : 'Failed to delete group',
      });
      return false;
    }
  },

  updateGroupPosition: async (id, x, y) => {
    // Optimistic update
    get().updateGroup(id, { position_x: x, position_y: y });

    try {
      if (!result.success) {
        // Don't revert position updates - they're cosmetic and frequent
        console.error('Failed to save group position:', result.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Failed to save group position:', error);
      return false;
    }
  },

  updateGroupSize: async (id, width, height) => {
    // Optimistic update
    get().updateGroup(id, { width, height });

    try {
      if (!result.success) {
        // Don't revert size updates - they're cosmetic and frequent
        console.error('Failed to save group size:', result.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Failed to save group size:', error);
      return false;
    }
  },

  assignItemToGroup: async (itemId, groupId) => {
    try {
      return result.success;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to assign item to group',
      });
      return false;
    }
  },

  reset: () => set(initialState),

  resetProjectState: () => set(initialState),
}));
