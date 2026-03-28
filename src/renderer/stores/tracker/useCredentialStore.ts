import { create } from 'zustand';
import type { TrackerCredentialInfo, TrackerType } from '../../../shared/types';
import {
  deleteTrackerCredentials,
  listTrackerCredentials,
  saveJiraTrackerCredentials,
  testJiraTrackerCredentials,
} from '../../services/trackerService';


interface CredentialState {
  credentials: TrackerCredentialInfo[];
  isLoading: boolean;
  error: string | null;
  showDialog: boolean;
  selectedTrackerType: TrackerType;

  loadCredentials: () => Promise<void>;
  deleteCredentials: (trackerType: TrackerType) => Promise<void>;
  setShowDialog: (show: boolean) => void;
  setSelectedTrackerType: (trackerType: TrackerType) => void;
  clearError: () => void;
}

export const useCredentialStore = create<CredentialState>((set, get) => ({
  credentials: [],
  isLoading: false,
  error: null,
  showDialog: false,
  selectedTrackerType: 'jira',

    set({ error: null });
    try {
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Connection test failed';
      set({ error });
      return { success: false, error };
    }
  },

  loadCredentials: async () => {
    set({ isLoading: true, error: null });
    try {
      const credentials = await listTrackerCredentials();
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

  deleteCredentials: async (trackerType) => {
    set({ error: null });
    try {
      }
      await get().loadCredentials();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete credentials' });
    }
  },

  setShowDialog: (show) => set({ showDialog: show }),
  setSelectedTrackerType: (selectedTrackerType) => set({ selectedTrackerType }),
  clearError: () => set({ error: null }),
}));
