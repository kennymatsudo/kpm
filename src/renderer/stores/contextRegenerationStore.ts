import { create } from 'zustand';

interface ContextRegenerationState {
  isOpen: boolean;
  close: () => void;
}

export const useContextRegenerationStore = create<ContextRegenerationState>((set) => ({
  isOpen: false,
}));
