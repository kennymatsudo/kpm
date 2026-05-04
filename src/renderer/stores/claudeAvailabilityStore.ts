import { create } from 'zustand';
import type { ClaudeAvailability } from '../../shared/types';
import { getClaudeAvailability, refreshClaudeAvailability } from '../services/settingsService';

interface ClaudeAvailabilityState {
  availability: ClaudeAvailability | null;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

function unwrap(
  response: Awaited<ReturnType<typeof getClaudeAvailability>>,
): { availability: ClaudeAvailability | null; error: string | null } {
  if (!response.success) {
    return { availability: null, error: response.error };
  }
  const { success: _success, ...rest } = response;
}

export const useClaudeAvailabilityStore = create<ClaudeAvailabilityState>((set) => ({
  availability: null,
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await getClaudeAvailability();
      const { availability, error } = unwrap(response);
      set({ availability, error, isLoading: false });
    } catch (e) {
      set({
        availability: null,
        error: e instanceof Error ? e.message : 'Failed to read Claude availability',
        isLoading: false,
      });
    }
  },

  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await refreshClaudeAvailability();
      const { availability, error } = unwrap(response);
      set({ availability, error, isLoading: false });
    } catch (e) {
      set({
        availability: null,
        error: e instanceof Error ? e.message : 'Failed to refresh Claude availability',
        isLoading: false,
      });
    }
  },
}));
