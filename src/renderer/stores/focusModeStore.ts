/** Holds the single markdown document currently open in the focus reader. */

import { create } from 'zustand';

export type ReadingTheme = 'light' | 'dark';

const READING_THEME_KEY = 'kpm.focusReadingTheme';
const READING_POSITIONS_KEY = 'kpm.focusReadingPositions';
const MAX_READING_POSITIONS = 80;

export interface FocusReadingPosition {
  scrollTop: number;
  activeId: string | null;
  updatedAt: number;
}

function loadReadingTheme(): ReadingTheme {
  try {
    return localStorage.getItem(READING_THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function loadReadingPositions(): Record<string, FocusReadingPosition> {
  try {
    const raw = localStorage.getItem(READING_POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, FocusReadingPosition>;
  } catch {
    return {};
  }
}

function saveReadingPositions(positions: Record<string, FocusReadingPosition>): void {
  try {
    const entries = Object.entries(positions)
      .filter(([, position]) => Number.isFinite(position.scrollTop))
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_READING_POSITIONS);
    localStorage.setItem(READING_POSITIONS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* persistence is best-effort */
  }
}

export interface FocusModeDoc {
  /** Project-relative path, used for labels/tooltips while the reader is open. */
  path: string;
  title: string;
  content: string;
}

interface FocusModeState {
  isOpen: boolean;
  docPath: string | null;
  docTitle: string;
  docContent: string;
  chatSessionId: string | null;
  /** Reading-only light/dark palette, independent of the app theme. Persisted. */
  readingTheme: ReadingTheme;

  open: (doc: FocusModeDoc) => void;
  close: () => void;
  setChatSessionId: (path: string, chatSessionId: string) => void;
  updateContent: (path: string, content: string) => void;
  toggleReadingTheme: () => void;
  getReadingPosition: (path: string) => FocusReadingPosition | null;
  saveReadingPosition: (path: string, position: Omit<FocusReadingPosition, 'updatedAt'>) => void;
}

const INITIAL = {
  isOpen: false,
  docPath: null,
  docTitle: '',
  docContent: '',
  chatSessionId: null,
};

export const useFocusModeStore = create<FocusModeState>((set) => ({
  ...INITIAL,
  // Persisted preference — kept out of INITIAL so close() doesn't reset it.
  readingTheme: loadReadingTheme(),

  open: (doc) =>
    set({
      isOpen: true,
      docPath: doc.path,
      docTitle: doc.title,
      docContent: doc.content,
      chatSessionId: null,
    }),

  close: () => set({ ...INITIAL }),

  setChatSessionId: (path, chatSessionId) =>
    set((state) => (
      state.isOpen && state.docPath === path
        ? { chatSessionId }
        : {}
    )),

  updateContent: (path, content) =>
    set((state) => (
      state.isOpen && state.docPath === path
        ? { docContent: content, chatSessionId: state.docContent === content ? state.chatSessionId : null }
        : {}
    )),

  toggleReadingTheme: () =>
    set((s) => {
      const next: ReadingTheme = s.readingTheme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(READING_THEME_KEY, next);
      } catch {
        /* persistence is best-effort */
      }
      return { readingTheme: next };
    }),

  getReadingPosition: (path) => loadReadingPositions()[path] ?? null,

  saveReadingPosition: (path, position) => {
    if (!path) return;
    const positions = loadReadingPositions();
    positions[path] = {
      ...position,
      scrollTop: Math.max(0, position.scrollTop),
      updatedAt: Date.now(),
    };
    saveReadingPositions(positions);
  },
}));
