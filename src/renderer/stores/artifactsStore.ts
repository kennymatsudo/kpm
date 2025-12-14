import { create } from 'zustand';

interface Artifact {
  filename: string;
  path: string;
  createdAt: string;
  modifiedAt: string;
  size: number;
}

interface ArtifactsState {
  // Artifacts list
  artifacts: Artifact[];
  isLoadingArtifacts: boolean;
  artifactsError: string | null;

  // Command palette
  isCommandPaletteOpen: boolean;

  // Actions
  setArtifacts: (artifacts: Artifact[]) => void;
  setIsLoadingArtifacts: (isLoading: boolean) => void;
  setArtifactsError: (error: string | null) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

export const useArtifactsStore = create<ArtifactsState>((set) => ({
  artifacts: [],
  isLoadingArtifacts: false,
  artifactsError: null,
  isCommandPaletteOpen: false,

  setArtifacts: (artifacts) => set({ artifacts }),
  setIsLoadingArtifacts: (isLoading) => set({ isLoadingArtifacts: isLoading }),
  setArtifactsError: (error) => set({ artifactsError: error }),

  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
  toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
}));
