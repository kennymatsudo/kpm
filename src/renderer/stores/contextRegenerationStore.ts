import { create } from 'zustand';

interface ContextRegenerationState {
  isOpen: boolean;
  /** When set, modal opens straight into the in-flight task instead of the configure phase. */
  resumeTaskId: string | null;
  open: (resumeTaskId?: string) => void;
  close: () => void;
}

export const useContextRegenerationStore = create<ContextRegenerationState>((set) => ({
  isOpen: false,
  resumeTaskId: null,
  open: (resumeTaskId) => set({ isOpen: true, resumeTaskId: resumeTaskId ?? null }),
  close: () => set({ isOpen: false, resumeTaskId: null }),
}));
