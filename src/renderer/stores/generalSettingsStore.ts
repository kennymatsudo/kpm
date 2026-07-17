import { create } from 'zustand';
import {
  deleteAnthropicApiKey,
  getSetting,
  hasAnthropicApiKey,
  saveAnthropicApiKey,
  setSetting,
  testAnthropicApiKey,
} from '../services/settingsService';
import { DEFAULT_CHAT_APPROVAL_MODE, type ChatApprovalMode } from '../../shared/appSettings';

interface GeneralSettingsState {
  hasAnthropicKey: boolean;
  isLoadingAnthropicKey: boolean;
  isTestingAnthropicKey: boolean;
  isSavingAnthropicKey: boolean;
  isDeletingAnthropicKey: boolean;
  branchTemplate: string;
  isLoadingBranchTemplate: boolean;
  approvalMode: ChatApprovalMode;
  isLoadingApprovalMode: boolean;
  approvalModeLoaded: boolean;
  respectGlobalClaudeMd: boolean;
  isLoadingRespectGlobalClaudeMd: boolean;
  respectGlobalClaudeMdLoaded: boolean;
  error: string | null;
  loadGeneralSettings: () => Promise<void>;
  loadAnthropicKeyStatus: () => Promise<{ success: boolean; hasKey?: boolean; error?: string }>;
  testAnthropicKey: (apiKey: string) => Promise<{ success: boolean; valid?: boolean; error?: string }>;
  saveAnthropicKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  deleteAnthropicKey: () => Promise<{ success: boolean; error?: string }>;
  saveBranchTemplate: (branchTemplate: string) => Promise<{ success: boolean; error?: string }>;
  loadApprovalMode: () => Promise<ChatApprovalMode>;
  saveApprovalMode: (approvalMode: ChatApprovalMode) => Promise<{ success: boolean; error?: string }>;
  loadRespectGlobalClaudeMd: () => Promise<boolean>;
  saveRespectGlobalClaudeMd: (respectGlobalClaudeMd: boolean) => Promise<{ success: boolean; error?: string }>;
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
  approvalMode: DEFAULT_CHAT_APPROVAL_MODE,
  isLoadingApprovalMode: true,
  approvalModeLoaded: false,
  respectGlobalClaudeMd: true,
  isLoadingRespectGlobalClaudeMd: true,
  respectGlobalClaudeMdLoaded: false,
  error: null as string | null,
};

export const useGeneralSettingsStore = create<GeneralSettingsState>((set, get) => ({
  ...initialState,

  loadGeneralSettings: async () => {
    set({
      isLoadingAnthropicKey: true,
      isLoadingBranchTemplate: true,
      isLoadingApprovalMode: true,
      isLoadingRespectGlobalClaudeMd: true,
      error: null,
    });

    const [keyResult, branchTemplate, approvalMode, respectGlobalClaudeMd] = await Promise.all([
      hasAnthropicApiKey().catch((error: unknown) => ({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load API key status',
      })),
      getSetting('branchNameTemplate'),
      getSetting('chatApprovalMode'),
      getSetting('respectGlobalClaudeMd'),
    ]);

    set({
      hasAnthropicKey: 'hasKey' in keyResult ? Boolean(keyResult.hasKey) : false,
      isLoadingAnthropicKey: false,
      branchTemplate,
      isLoadingBranchTemplate: false,
      approvalMode,
      isLoadingApprovalMode: false,
      approvalModeLoaded: true,
      respectGlobalClaudeMd,
      isLoadingRespectGlobalClaudeMd: false,
      respectGlobalClaudeMdLoaded: true,
      error: (!keyResult.success && keyResult.error) || null,
    });
  },

  loadAnthropicKeyStatus: async () => {
    set({ isLoadingAnthropicKey: true, error: null });
    try {
      const result = await hasAnthropicApiKey();
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
      const result = await testAnthropicApiKey(apiKey);
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

      const result = await saveAnthropicApiKey(apiKey);
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
      const result = await deleteAnthropicApiKey();
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
      const result = await setSetting('branchNameTemplate', branchTemplate);
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

  loadApprovalMode: async () => {
    const state = get();
    if (state.approvalModeLoaded) return state.approvalMode;

    set({ isLoadingApprovalMode: true, error: null });
    try {
      const approvalMode = await getSetting('chatApprovalMode');
      set({ approvalMode, isLoadingApprovalMode: false, approvalModeLoaded: true });
      return approvalMode;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load chat approval mode';
      set({
        approvalMode: DEFAULT_CHAT_APPROVAL_MODE,
        isLoadingApprovalMode: false,
        approvalModeLoaded: true,
        error: message,
      });
      return DEFAULT_CHAT_APPROVAL_MODE;
    }
  },

  saveApprovalMode: async (approvalMode) => {
    set({ error: null });
    try {
      const result = await setSetting('chatApprovalMode', approvalMode);
      if (!result.success) {
        const error = result.error || 'Failed to save chat approval mode';
        set({ error });
        return { success: false, error };
      }

      set({ approvalMode, approvalModeLoaded: true });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save chat approval mode';
      set({ error: message });
      return { success: false, error: message };
    }
  },

  loadRespectGlobalClaudeMd: async () => {
    const state = get();
    if (state.respectGlobalClaudeMdLoaded) return state.respectGlobalClaudeMd;

    set({ isLoadingRespectGlobalClaudeMd: true, error: null });
    try {
      const respectGlobalClaudeMd = await getSetting('respectGlobalClaudeMd');
      set({ respectGlobalClaudeMd, isLoadingRespectGlobalClaudeMd: false, respectGlobalClaudeMdLoaded: true });
      return respectGlobalClaudeMd;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load global instructions setting';
      set({
        respectGlobalClaudeMd: true,
        isLoadingRespectGlobalClaudeMd: false,
        respectGlobalClaudeMdLoaded: true,
        error: message,
      });
      return true;
    }
  },

  saveRespectGlobalClaudeMd: async (respectGlobalClaudeMd) => {
    set({ error: null });
    try {
      const result = await setSetting('respectGlobalClaudeMd', respectGlobalClaudeMd);
      if (!result.success) {
        const error = result.error || 'Failed to save global instructions setting';
        set({ error });
        return { success: false, error };
      }

      set({ respectGlobalClaudeMd, respectGlobalClaudeMdLoaded: true });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save global instructions setting';
      set({ error: message });
      return { success: false, error: message };
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
