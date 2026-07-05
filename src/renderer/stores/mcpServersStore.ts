import { create } from 'zustand';
import type { DiscoveredPlugin, UserMcpServer, DiscoveredMcpServer } from '../../shared/types';
import {
  getMcpServerPreferences,
  listAvailableMcpServers,
  setMcpServerEnabled,
} from '../services/mcpServersService';

interface McpServersState {
  plugins: DiscoveredPlugin[];
  userServers: UserMcpServer[];
  managedServers: DiscoveredMcpServer[];
  preferences: Record<string, boolean>;
  isLoading: boolean;
  togglingServerName: string | null;
  error: string | null;
  loadServers: (force?: boolean) => Promise<{ success: boolean; error?: string }>;
  setServerEnabled: (
    serverKey: string,
    enabled: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  plugins: [] as DiscoveredPlugin[],
  userServers: [] as UserMcpServer[],
  managedServers: [] as DiscoveredMcpServer[],
  preferences: {} as Record<string, boolean>,
  isLoading: false,
  togglingServerName: null as string | null,
  error: null as string | null,
};

export const useMcpServersStore = create<McpServersState>((set, get) => ({
  ...initialState,

  loadServers: async (force = false) => {
    const state = get();
    if (!force && !state.isLoading && (state.plugins.length > 0 || state.userServers.length > 0 || state.managedServers.length > 0)) {
      return { success: true };
    }

    set({ isLoading: true, error: null });
    try {
      const [listResult, prefsResult] = await Promise.all([
        listAvailableMcpServers(),
        getMcpServerPreferences(),
      ]);

      set({
        plugins: listResult.plugins || [],
        userServers: listResult.userServers || [],
        managedServers: listResult.managedServers || [],
        preferences: prefsResult.preferences || {},
        isLoading: false,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load MCP servers';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  setServerEnabled: async (serverKey, enabled) => {
    set({ togglingServerName: serverKey, error: null });
    try {
      const result = await setMcpServerEnabled(serverKey, enabled);
      if (!result.success) {
        const error = result.error || 'Failed to update MCP server preference';
        set({ togglingServerName: null, error });
        return { success: false, error };
      }

      set((state) => ({
        preferences: { ...state.preferences, [serverKey]: enabled },
        togglingServerName: null,
      }));
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update MCP server preference';
      set({ togglingServerName: null, error: message });
      return { success: false, error: message };
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
