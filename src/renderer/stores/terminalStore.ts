import { create } from 'zustand';

export interface TerminalEntry {
  id: string;
  cwd?: string;
  status: 'starting' | 'running' | 'exited';
  exitCode?: number;
}

interface TerminalState {
  isPanelOpen: boolean;
  panelHeight: number;
  terminals: TerminalEntry[];
  activeTerminalId: string | null;

  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setPanelHeight: (height: number) => void;

  addTerminal: (entry: TerminalEntry) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;
  setTerminalStatus: (id: string, status: TerminalEntry['status'], exitCode?: number) => void;
}

const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 800;
const MAX_VIEWPORT_FRACTION = 0.65;

export const useTerminalStore = create<TerminalState>((set) => ({
  isPanelOpen: false,
  panelHeight: DEFAULT_HEIGHT,
  terminals: [],
  activeTerminalId: null,

  togglePanel() {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  setPanelOpen(open) {
    set({ isPanelOpen: open });
  },

  setPanelHeight(height) {
    const viewportMax = Math.floor(
      (typeof window !== 'undefined' ? window.innerHeight : 1080) * MAX_VIEWPORT_FRACTION,
    );
    const effectiveMax = Math.min(MAX_HEIGHT, viewportMax);
    const clamped = Math.min(effectiveMax, Math.max(MIN_HEIGHT, height));
    set({ panelHeight: clamped });
  },

  addTerminal(entry) {
    set((state) => ({
      terminals: [...state.terminals, entry],
      activeTerminalId: entry.id,
    }));
  },

  removeTerminal(id) {
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      const activeTerminalId =
        state.activeTerminalId === id ? (terminals[terminals.length - 1]?.id ?? null) : state.activeTerminalId;
      return { terminals, activeTerminalId };
    });
  },

  setActiveTerminal(id) {
    set({ activeTerminalId: id });
  },

  setTerminalStatus(id, status, exitCode) {
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, status, exitCode } : t)),
    }));
  },
}));
