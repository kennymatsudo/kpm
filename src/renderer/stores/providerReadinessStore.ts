import { create } from 'zustand';
import type { ProvidersReadiness } from '../../shared/types';
import { getProviderReadiness, refreshProviderReadiness } from '../services/settingsService';

interface ProviderReadinessState {
  readiness: ProvidersReadiness | null;
  isLoading: boolean;
  error: string | null;
  /** Cached read — for the landing screen. */
  load: () => Promise<void>;
  /** Re-reads every provider, bypassing caches — for the connect step after sign-in. Returns the fresh readiness. */
  refresh: () => Promise<ProvidersReadiness | null>;
}

function unwrap(
  response: Awaited<ReturnType<typeof getProviderReadiness>>,
): { readiness: ProvidersReadiness | null; error: string | null } {
  if (!response.success) {
    return { readiness: null, error: response.error };
  }
  const { success: _success, ...rest } = response;
  return { readiness: rest, error: null };
}

export const useProviderReadinessStore = create<ProviderReadinessState>((set) => ({
  readiness: null,
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await getProviderReadiness();
      const { readiness, error } = unwrap(response);
      set({ readiness, error, isLoading: false });
    } catch (e) {
      set({
        readiness: null,
        error: e instanceof Error ? e.message : 'Failed to read provider readiness',
        isLoading: false,
      });
    }
  },

  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await refreshProviderReadiness();
      const { readiness, error } = unwrap(response);
      set({ readiness, error, isLoading: false });
      return readiness;
    } catch (e) {
      set({
        readiness: null,
        error: e instanceof Error ? e.message : 'Failed to refresh provider readiness',
        isLoading: false,
      });
      return null;
    }
  },
}));
