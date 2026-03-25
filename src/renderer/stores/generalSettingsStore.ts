import { create } from 'zustand';

const BRANCH_TEMPLATE_KEY = 'branch_name_template';

interface GeneralSettingsState {
  hasAnthropicKey: boolean;
  isLoadingAnthropicKey: boolean;
  isTestingAnthropicKey: boolean;
  isSavingAnthropicKey: boolean;
  isDeletingAnthropicKey: boolean;
  branchTemplate: string;
  isLoadingBranchTemplate: boolean;
  error: string | null;
  loadGeneralSettings: () => Promise<void>;
  loadAnthropicKeyStatus: () => Promise<{ success: boolean; hasKey?: boolean; error?: string }>;
  testAnthropicKey: (apiKey: string) => Promise<{ success: boolean; valid?: boolean; error?: string }>;
  saveAnthropicKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  deleteAnthropicKey: () => Promise<{ success: boolean; error?: string }>;
  saveBranchTemplate: (branchTemplate: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  hasAnthropicKey: false,
  isLoadingAnthropicKey: false,
  isTestingAnthropicKey: false,
  isSavingAnthropicKey: false,
  isDeletingAnthropicKey: false,
  branchTemplate: '',
  isLoadingBranchTemplate: true,
  error: null as string | null,
};

export const useGeneralSettingsStore = create<GeneralSettingsState>((set, get) => ({
  ...initialState,

  loadGeneralSettings: async () => {
    set({
      isLoadingAnthropicKey: true,
      isLoadingBranchTemplate: true,
      error: null,
    });

        success: false,
        error: error instanceof Error ? error.message : 'Failed to load API key status',
      })),
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load branch template',
      })),
    ]);

    set({
      isLoadingAnthropicKey: false,
      isLoadingBranchTemplate: false,
      error:
        (!keyResult.success && keyResult.error) ||
        (!branchResult.success && branchResult.error) ||
        null,
    });
  },

  loadAnthropicKeyStatus: async () => {
    set({ isLoadingAnthropicKey: true, error: null });
    try {
      if (!result.success) {
        const error = result.error || 'Failed to load API key status';
        set({ isLoadingAnthropicKey: false, error });
        return { success: false, error };
      }

      set({ hasAnthropicKey: Boolean(result.hasKey), isLoadingAnthropicKey: false });
      return { success: true, hasKey: Boolean(result.hasKey) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load API key status';
      set({ isLoadingAnthropicKey: false, error: message });
      return { success: false, error: message };
    }
  },

  testAnthropicKey: async (apiKey) => {
    set({ isTestingAnthropicKey: true, error: null });
    try {
      if (!result.success || !result.valid) {
        const error = result.error || 'Invalid API key';
        set({ isTestingAnthropicKey: false, error });
        return { success: false, valid: false, error };
      }

      set({ isTestingAnthropicKey: false });
      return { success: true, valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      set({ isTestingAnthropicKey: false, error: message });
      return { success: false, valid: false, error: message };
    }
  },

  saveAnthropicKey: async (apiKey) => {
    set({ isSavingAnthropicKey: true, error: null });
    try {
      const testResult = await get().testAnthropicKey(apiKey);
      if (!testResult.success) {
        set({ isSavingAnthropicKey: false });
        return { success: false, error: testResult.error };
      }

      if (!result.success) {
        const error = result.error || 'Failed to save API key';
        set({ isSavingAnthropicKey: false, error });
        return { success: false, error };
      }

      set({
        hasAnthropicKey: true,
        isSavingAnthropicKey: false,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      set({ isSavingAnthropicKey: false, error: message });
      return { success: false, error: message };
    }
  },

  deleteAnthropicKey: async () => {
    set({ isDeletingAnthropicKey: true, error: null });
    try {
      if (!result.success) {
        const error = result.error || 'Failed to delete API key';
        set({ isDeletingAnthropicKey: false, error });
        return { success: false, error };
      }

      set({
        hasAnthropicKey: false,
        isDeletingAnthropicKey: false,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      set({ isDeletingAnthropicKey: false, error: message });
      return { success: false, error: message };
    }
  },

  saveBranchTemplate: async (branchTemplate) => {
    set({ error: null });
    try {
      if (!result.success) {
        const error = result.error || 'Failed to save branch template';
        set({ error });
        return { success: false, error };
      }

      set({ branchTemplate });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save branch template';
      set({ error: message });
      return { success: false, error: message };
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
