import { useEffect } from 'react';

export interface UseLayoutShortcutsOptions {
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  onMainViewChange: (view: MainView) => void;
  onOpenCommandPalette: () => void;
  onCreateItem?: () => void;
  onToggleToolLog?: () => void;
  onOpenGlobalSearch?: () => void;
}

export function useLayoutShortcuts({
  onToggleSidebar,
  onToggleChat,
  onMainViewChange,
  onOpenCommandPalette,
  onCreateItem,
  onToggleToolLog,
  onOpenGlobalSearch,
}: UseLayoutShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditableElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Cmd+K (Mac) or Ctrl+K (Windows/Linux) to toggle command palette
      // Skip if focused on editable element (let editor handle formatting shortcuts)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !isEditableElement) {
        e.preventDefault();
        e.stopPropagation();
        onOpenCommandPalette();
      }
      // Cmd+B (Mac) or Ctrl+B (Windows/Linux) to toggle left sidebar
      // Skip if focused on editable element (let editor handle bold)
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !isEditableElement) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSidebar();
      }
      // Cmd+L (Mac) or Ctrl+L (Windows/Linux) to toggle chat sidebar
        e.preventDefault();
        e.stopPropagation();
        onToggleChat();
      }
      // Cmd+Shift+I (Mac) or Ctrl+Shift+I (Windows/Linux) to create plan item
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        e.stopPropagation();
        onCreateItem?.();
      }
      // Cmd+Shift+T (Mac) or Ctrl+Shift+T (Windows/Linux) to toggle tool log panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        e.stopPropagation();
        onToggleToolLog?.();
      }
      // Cmd+Shift+F (Mac) or Ctrl+Shift+F (Windows/Linux) to open global search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        onOpenGlobalSearch?.();
      }
      // Cmd+1-9 - Context-aware: Settings tabs (when open) or Main views (1-2)
      if (!isEditableElement && (e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const { isOpen: settingsIsOpen, goToTab, visibleTabCount } = useSettingsUIStore.getState();
        const keyNum = parseInt(e.key, 10);

        if (settingsIsOpen) {
          // Navigate settings tabs (1-indexed, up to visibleTabCount)
          if (keyNum <= visibleTabCount) {
            e.preventDefault();
            goToTab(keyNum);
          }
        } else {
          // Navigate main views (only 1-2)
          if (keyNum <= 2) {
            e.preventDefault();
            if (e.key === '1') {
              onMainViewChange('workspace');
            } else if (e.key === '2') {
              onMainViewChange('planning');
            }
          }
        }
      }
    };
    // Use capture phase to catch event before it reaches other elements
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
}
