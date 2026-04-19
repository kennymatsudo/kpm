import { create } from 'zustand';
import type { TrackerCredentialInfo, TrackerType } from '../../../shared/types';
import {
  deleteLinearTrackerCredentials,
  deleteTrackerCredentials,
  listTrackerCredentials,
  saveJiraTrackerCredentials,
  saveLinearTrackerCredentials,
  testJiraTrackerCredentials,
  testLinearTrackerCredentials,
} from '../../services/trackerService';

/**
 * Credential draft is a discriminated union — Jira needs site URL + email +
 * API token; Linear needs only an API token.
 */
export type TrackerCredentialDraft =
  | { type: 'jira'; siteUrl: string; email: string; apiToken: string }
  | { type: 'linear'; apiToken: string };

interface CredentialState {
  credentials: TrackerCredentialInfo[];
  isLoading: boolean;
  error: string | null;
  showDialog: boolean;
  selectedTrackerType: TrackerType;

  loadCredentials: () => Promise<void>;
  testCredentials: (draft: TrackerCredentialDraft) => Promise<{ success: boolean; error?: string }>;
  saveCredentials: (draft: TrackerCredentialDraft) => Promise<{ success: boolean; error?: string }>;
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

  testCredentials: async (draft) => {
    set({ error: null });
    try {
      if (draft.type === 'jira') {
        const result = await testJiraTrackerCredentials(draft.siteUrl, draft.email, draft.apiToken);
        if (!result.success) return { success: false, error: result.error || 'Connection failed' };
        return { success: true };
      }
      const result = await testLinearTrackerCredentials(draft.apiToken);
      if (!result.success) return { success: false, error: result.error || 'Connection failed' };
      return { success: true };
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

  saveCredentials: async (draft) => {
    set({ error: null });

    const testResult = await get().testCredentials(draft);
    if (!testResult.success) {
      return { success: false, error: testResult.error };
    }

    if (draft.type === 'jira') {
      const saveResult = await saveJiraTrackerCredentials(draft.siteUrl, draft.email, draft.apiToken);
      if (!saveResult.success) return { success: false, error: saveResult.error };
    } else {
      const saveResult = await saveLinearTrackerCredentials(draft.apiToken);
      if (!saveResult.success) return { success: false, error: saveResult.error };
    }

    await get().loadCredentials();
    return { success: true };
  },

  deleteCredentials: async (trackerType) => {
    set({ error: null });
    try {
      if (trackerType === 'jira') {
        await deleteTrackerCredentials();
      } else {
        await deleteLinearTrackerCredentials();
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
