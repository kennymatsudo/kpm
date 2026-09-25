import { useEffect, useState } from 'react';
import { createTabScopeTracker, type TabScope } from '../tabScope';
import { useSettingsUIStore, useCommandPaletteStore, useSearchStore } from '../../../stores';
import { subscribeToCloseContextMenu } from '../../../services/menuService';

export interface UseLayoutShortcutsOptions {
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  /** Pick the tab at a 1-indexed position in the strip the user last worked in. Bound to Cmd/Ctrl+1..9. */
  onSelectTab: (scope: TabScope, position: number) => void;
  onOpenCommandPalette: () => void;
  onCreateItem?: () => void;
  onToggleToolLog?: () => void;
  onOpenGlobalSearch?: () => void;
  /** Toggle the embedded terminal panel. Bound to Cmd/Ctrl+`. */
  onToggleTerminal?: () => void;
  /** Switch project by 1-indexed position (1..10). Called via Cmd+Option+1..9 / Cmd+Option+0. */
  onSwitchProjectByPosition?: (position: number) => void;
  /** Toggle the focus reader. Bound to Cmd/Ctrl+Shift+M. */
  onToggleFocusMode?: () => void;
  /** Close the currently focused context (file editor, chat session, or window). */
  onClose?: () => void;
  /** Move to the previous (-1) or next (1) chat session. Bound to Cmd/Ctrl+Shift+[ and ]. */
  onCycleChatSession?: (direction: -1 | 1) => void;
  /** Move to the previous (-1) or next (1) open document. Bound to Cmd/Ctrl+Option+[ and ]. */
  onCycleDocument?: (direction: -1 | 1) => void;
}

export function useLayoutShortcuts({
  onToggleSidebar,
  onToggleChat,
  onSelectTab,
  onOpenCommandPalette,
  onCreateItem,
  onToggleToolLog,
  onOpenGlobalSearch,
  onToggleTerminal,
  onSwitchProjectByPosition,
  onToggleFocusMode,
  onClose,
  onCycleChatSession,
  onCycleDocument,
}: UseLayoutShortcutsOptions): void {
  // Outlives the keydown effect below, which re-binds whenever a handler
  // changes; a re-bind must not forget where the user last clicked.
  const [tabScope] = useState(createTabScopeTracker);

  useEffect(() => {
    const noteInteraction = (e: Event) => tabScope.note(e.target);
    window.addEventListener('pointerdown', noteInteraction, true);
    window.addEventListener('focusin', noteInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', noteInteraction, true);
      window.removeEventListener('focusin', noteInteraction, true);
    };
  }, [tabScope]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditableElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isCommandPaletteOpen = useCommandPaletteStore.getState().isCommandPaletteOpen;
      const isGlobalSearchOpen = useSearchStore.getState().isOpen;

      // Avoid layout-level shortcut collisions while full-screen overlays are active.
      if (isCommandPaletteOpen || isGlobalSearchOpen) {
        return;
      }

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'l' && !isEditableElement) {
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
      // Cmd+Shift+M (Mac) or Ctrl+Shift+M (Windows/Linux) to toggle the focus reader.
      // Works even in editable elements because Markdown editing already has its
      // own formatting controls, and the same shortcut exits the reader.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        e.stopPropagation();
        onToggleFocusMode?.();
      }
      // Cmd+` (Mac) or Ctrl+` (Windows/Linux) to toggle embedded terminal panel.
      // Match VS Code: works even in editable elements — backtick is not a standard text shortcut.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        e.stopPropagation();
        onToggleTerminal?.();
      }
      // Cmd+Shift+[ / ] to move between chat sessions, matching how browsers
      // cycle tabs on macOS. Uses e.code because Shift rewrites the bracket
      // keys, and runs inside editable elements so a session switch never
      // requires leaving the composer first.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.code === 'BracketLeft' || e.code === 'BracketRight')
      ) {
        e.preventDefault();
        e.stopPropagation();
        onCycleChatSession?.(e.code === 'BracketLeft' ? -1 : 1);
        return;
      }
      // Cmd+Option+[ / ] to move between open documents — the same gesture as
      // the chat strip one modifier over, since both are tab strips.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey &&
        (e.code === 'BracketLeft' || e.code === 'BracketRight')
      ) {
        e.preventDefault();
        e.stopPropagation();
        onCycleDocument?.(e.code === 'BracketLeft' ? -1 : 1);
        return;
      }
      // Cmd+Option+1-9 / Cmd+Option+0 - Switch projects by stable position.
      // Use e.code (Digit1..Digit9, Digit0) because Option held on macOS rewrites e.key
      // to special characters (¡, ™, etc.). Handle even in editable elements so users
      // can switch while typing in chat — Cmd+Option+digit isn't a standard text shortcut.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey &&
        /^Digit[0-9]$/.test(e.code)
      ) {
        e.preventDefault();
        e.stopPropagation();
        const digit = e.code.slice(5);
        const position = digit === '0' ? 10 : parseInt(digit, 10);
        onSwitchProjectByPosition?.(position);
        return;
      }
      // Cmd+1-9 - Settings tabs while Settings is open, otherwise the tab strip
      // the user last clicked or focused in. Runs inside editable elements so
      // the chat composer can switch chats without leaving the text box.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const { isOpen: settingsIsOpen, goToTab, visibleTabIds } = useSettingsUIStore.getState();
        const keyNum = parseInt(e.key, 10);
        e.preventDefault();

        if (settingsIsOpen) {
          if (keyNum <= visibleTabIds.length) goToTab(keyNum);
        } else {
          onSelectTab(tabScope.current(), keyNum);
        }
      }
    };
    // Use capture phase to catch event before it reaches other elements
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [tabScope, onToggleSidebar, onToggleChat, onSelectTab, onOpenCommandPalette, onCreateItem, onToggleToolLog, onOpenGlobalSearch, onToggleTerminal, onSwitchProjectByPosition, onToggleFocusMode, onCycleChatSession, onCycleDocument]);

  useEffect(() => {
    return subscribeToCloseContextMenu(() => {
      onClose?.();
    });
  }, [onClose]);
}
