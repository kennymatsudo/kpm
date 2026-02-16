import { useEffect } from 'react';

type ViewMode = 'diff' | 'preview' | 'edit';

interface MarkdownKeyboardDeps {
  isOpen: boolean;
  viewMode: ViewMode;
  draft: string;
  showSearch: boolean;
  oldContent: string | null | undefined;
  onClose: () => void;
  onSave: (content: string) => void;
  setViewMode: (updater: (prev: ViewMode) => ViewMode) => void;
  setShowSearch: (show: boolean) => void;
  closeSearch: () => void;
  formatBold: () => void;
  formatItalic: () => void;
  formatLink: () => void;
}

export function useMarkdownKeyboard({
  isOpen,
  viewMode,
  draft,
  showSearch,
  oldContent,
  onClose,
  onSave,
  setViewMode,
  setShowSearch,
  closeSearch,
  formatBold,
  formatItalic,
  formatLink,
}: MarkdownKeyboardDeps): void {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent): void {
      // Escape handling - close search first, then close modal
      if (e.key === 'Escape') {
        if (showSearch) {
          e.preventDefault();
          closeSearch();
          return;
        }
        onClose();
        return;
      }

      // Search shortcut (Cmd+F)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      // Toggle edit mode (cycle through diff -> preview -> edit)
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setViewMode((prev: ViewMode) => {
          if (prev === 'diff') return 'preview';
          if (prev === 'preview') return 'edit';
          return oldContent !== undefined ? 'diff' : 'preview';
        });
        return;
      }

      // Save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && viewMode === 'edit') {
        e.preventDefault();
        onSave(draft);
        return;
      }

      // Formatting shortcuts (only in edit mode)
      if (viewMode === 'edit' && (e.metaKey || e.ctrlKey)) {
        switch (e.key) {
          case 'b':
            e.preventDefault();
            formatBold();
            break;
          case 'i':
            e.preventDefault();
            formatItalic();
            break;
          case 'k':
            e.preventDefault();
            formatLink();
            break;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, viewMode, draft, onClose, onSave, formatBold, formatItalic, formatLink, showSearch, closeSearch, oldContent, setViewMode, setShowSearch]);
}
