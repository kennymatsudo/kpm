/**
 * Briefing Store
 *
 * State management for the "What should I do next?" briefing system.
 * Caches briefings per project so switching projects and back preserves
 * results. Cached briefings expire at midnight local time, and the main
 * process additionally rejects cached rows when plan items have been
 * updated since the briefing was generated.
 *
 * Streaming: while a briefing is generating, the main process emits
 * `briefing:chunk` events which accumulate in `streamingByProject`.
 * The modal renders the streaming text live, then swaps to the final
 * persisted summary on completion.
 */

import { create } from 'zustand';
import type { BriefingResult } from '../../shared/types';
import {
  generateProjectBriefing,
  getProjectBriefing,
  onProjectBriefingChunk,
} from '../services/briefingService';

/** Returns true if the briefing was generated before the start of today (local time). */
export function isBriefingStale(briefing: BriefingResult): boolean {
  const generatedDate = new Date(briefing.generatedAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return generatedDate < startOfToday;
}

interface BriefingState {
  briefings: Record<string, BriefingResult>;
  streamingByProject: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  isModalOpen: boolean;

  generateBriefing: (projectId: string) => Promise<void>;
  loadBriefing: (projectId: string) => Promise<boolean>;
  openModal: () => void;
  closeModal: () => void;
  reset: () => void;
}

export const useBriefingStore = create<BriefingState>((set, get) => {
  // Subscribe to chunk events once at store creation.
  onProjectBriefingChunk(({ projectId, delta }) => {
    const current = get().streamingByProject[projectId] ?? '';
    set((state) => ({
      streamingByProject: { ...state.streamingByProject, [projectId]: current + delta },
    }));
  });

  return {
    briefings: {},
    streamingByProject: {},
    isLoading: false,
    error: null,
    isModalOpen: false,

    generateBriefing: async (projectId: string) => {
      set((state) => ({
        isLoading: true,
        error: null,
        streamingByProject: { ...state.streamingByProject, [projectId]: '' },
      }));
      try {
        const result = await generateProjectBriefing(projectId);
        if (result.success) {
          set((state) => {
            const next = { ...state.streamingByProject };
            delete next[projectId];
            return {
              briefings: { ...state.briefings, [projectId]: result.data },
              streamingByProject: next,
              isLoading: false,
            };
          });
        } else {
          set((state) => {
            const next = { ...state.streamingByProject };
            delete next[projectId];
            return {
              error: result.error ?? 'Failed to generate briefing',
              isLoading: false,
              streamingByProject: next,
            };
          });
        }
      } catch (e) {
        set((state) => {
          const next = { ...state.streamingByProject };
          delete next[projectId];
          return {
            error: e instanceof Error ? e.message : 'Unknown error',
            isLoading: false,
            streamingByProject: next,
          };
        });
      }
    },

    loadBriefing: async (projectId: string) => {
      try {
        const result = await getProjectBriefing(projectId);
        if (result.success && result.data && !isBriefingStale(result.data)) {
          set((state) => ({
            briefings: { ...state.briefings, [projectId]: result.data! },
          }));
          return true;
        }
      } catch {
        // Non-critical — fall through to generate
      }
      return false;
    },

    openModal: () => set({ isModalOpen: true, error: null }),
    closeModal: () => set({ isModalOpen: false }),

    reset: () => set({ briefings: {}, streamingByProject: {}, isLoading: false, error: null, isModalOpen: false }),
  };
});
