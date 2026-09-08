import { create } from 'zustand';
import type { ToolCallLogEntry, ToolCallTurnSummary, ActivityType } from '../../shared/types';
import { setToolLogEnabled } from '../services/toolLogService';

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
/** Coarser-grained than entries: one summary per Claude turn */
const MAX_RENDERER_SUMMARIES = 200;

/**
 * The main process records nothing unless someone is reading: each call there
 * costs a serialize, a disk append, and an IPC broadcast.
 */
function syncRecording(state: Pick<ToolLogState, 'isPanelOpen' | 'isEnabled'>): void {
  void setToolLogEnabled(state.isPanelOpen && state.isEnabled);
}

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
    set((state) => {
      const summaries = [...state.summaries, summary];
      if (summaries.length > MAX_RENDERER_SUMMARIES) {
        summaries.shift();
      }
      return { summaries };
    });
  },

  togglePanel() {
    set((state) => {
      const next = { isPanelOpen: !state.isPanelOpen };
      syncRecording({ ...state, ...next });
      return next;
    });
  },

  setEnabled(enabled: boolean) {
    set((state) => {
      const next = { isEnabled: enabled };
      syncRecording({ ...state, ...next });
      return next;
    });
  },

  setFilterCategory(cat: ActivityType | null) {
    set({ filterCategory: cat });
  },

  clearSession() {
    set({ entries: [], summaries: [] });
  },
}));
