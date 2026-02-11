import { create } from 'zustand';
import type { ToolCallLogEntry, ToolCallTurnSummary, ActivityType } from '../../shared/types';

interface ToolLogState {
  entries: ToolCallLogEntry[];
  summaries: ToolCallTurnSummary[];
  isPanelOpen: boolean;
  isEnabled: boolean;
  filterCategory: ActivityType | null;

  addEntry(entry: ToolCallLogEntry): void;
  addTurnSummary(summary: ToolCallTurnSummary): void;
  togglePanel(): void;
  setEnabled(enabled: boolean): void;
  setFilterCategory(cat: ActivityType | null): void;
  clearSession(): void;
}

/** Maximum entries to keep in the renderer store */
const MAX_RENDERER_ENTRIES = 500;

export const useToolLogStore = create<ToolLogState>((set) => ({
  entries: [],
  summaries: [],
  isPanelOpen: false,
  isEnabled: true,
  filterCategory: null,

  addEntry(entry: ToolCallLogEntry) {
    set((state) => {
      const entries = [...state.entries, entry];
      if (entries.length > MAX_RENDERER_ENTRIES) {
        entries.shift();
      }
      return { entries };
    });
  },

  addTurnSummary(summary: ToolCallTurnSummary) {
  },

  togglePanel() {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  setEnabled(enabled: boolean) {
    set({ isEnabled: enabled });
  },

  setFilterCategory(cat: ActivityType | null) {
    set({ filterCategory: cat });
  },

  clearSession() {
    set({ entries: [], summaries: [] });
  },
}));
