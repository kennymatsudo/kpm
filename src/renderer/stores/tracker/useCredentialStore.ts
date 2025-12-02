import { create } from 'zustand';

interface CredentialState {
  credentials: TrackerCredentialInfo[];
  isLoading: boolean;
  error: string | null;
  showDialog: boolean;

  loadCredentials: () => Promise<void>;
  setShowDialog: (show: boolean) => void;
  clearError: () => void;
}

export const useCredentialStore = create<CredentialState>((set, get) => ({
  credentials: [],
  isLoading: false,
  error: null,
  showDialog: false,

  loadCredentials: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ credentials });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load credentials' });
    } finally {
      set({ isLoading: false });
    }
  },

    set({ error: null });

    if (!testResult.success) {
      return { success: false, error: testResult.error };
    }

    }

    await get().loadCredentials();
    return { success: true };
  },

    set({ error: null });
    try {
      await get().loadCredentials();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete credentials' });
    }
  },

  setShowDialog: (show) => set({ showDialog: show }),
  clearError: () => set({ error: null }),
}));
