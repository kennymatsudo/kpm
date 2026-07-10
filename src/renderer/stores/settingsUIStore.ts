import { create } from 'zustand';

export type SettingsTab =
  | 'general'
  | 'commands'
  | 'workflow'
  | 'shortcuts'
  | 'prompts'
  | 'mcp'
  | 'permissions';

interface SettingsUIState {
  isOpen: boolean;
  activeTab: SettingsTab;
  /** Currently visible tabs in display order; set by the modal, which knows which tabs a project gates. */
  visibleTabIds: SettingsTab[];

  setIsOpen: (open: boolean) => void;
  setActiveTab: (tab: SettingsTab) => void;
  setVisibleTabIds: (ids: SettingsTab[]) => void;
  /** Navigate to tab by 1-indexed number (for Cmd+1/2/3 shortcuts) */
  goToTab: (index: number) => void;
}

export const useSettingsUIStore = create<SettingsUIState>((set, get) => ({
  isOpen: false,
  activeTab: 'general',
  visibleTabIds: [],

  setIsOpen: (open) => set({ isOpen: open, activeTab: open ? get().activeTab : 'general' }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setVisibleTabIds: (ids) => set({ visibleTabIds: ids }),

  goToTab: (index) => {
    const tab = get().visibleTabIds[index - 1];
    if (tab) {
      set({ activeTab: tab });
    }
  },
}));
