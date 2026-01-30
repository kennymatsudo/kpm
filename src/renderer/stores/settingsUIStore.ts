import { create } from 'zustand';

export type SettingsTab =

interface SettingsUIState {
  isOpen: boolean;
  activeTab: SettingsTab;
  /** Number of visible tabs (depends on whether a project is open) */
  visibleTabCount: number;

  setIsOpen: (open: boolean) => void;
  setActiveTab: (tab: SettingsTab) => void;
  setVisibleTabCount: (count: number) => void;
  /** Navigate to tab by 1-indexed number (for Cmd+1/2/3 shortcuts) */
  goToTab: (index: number) => void;
}

/** Ordered list of tabs for index-based navigation */
const TAB_ORDER: SettingsTab[] = [
];

export const useSettingsUIStore = create<SettingsUIState>((set, get) => ({
  isOpen: false,


  setActiveTab: (tab) => set({ activeTab: tab }),

  setVisibleTabCount: (count) => set({ visibleTabCount: count }),

  goToTab: (index) => {
    const { visibleTabCount } = get();
    // Bounds check: 1-indexed, must be within visible tabs
    if (index < 1 || index > visibleTabCount) {
      return;
    }
    const tab = TAB_ORDER[index - 1];
    if (tab) {
      set({ activeTab: tab });
    }
  },
}));
