import { useEffect, useCallback } from 'react';
import { useSettingsUIStore } from '../../stores';

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const shortcuts: ShortcutGroup[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: ['⌘', 'B'], description: 'Toggle sidebar' },
      { keys: ['⌘', 'L'], description: 'Toggle chat panel' },
      { keys: ['⌘', ','], description: 'Open settings' },
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['⌘', '⇧', 'F'], description: 'Open global search' },
      { keys: ['⌘', '⇧', 'I'], description: 'Create plan item' },
      { keys: ['⌘', '⇧', 'T'], description: 'Toggle tool log' },
      { keys: ['⌘', '`'], description: 'Toggle terminal' },
      { keys: ['⌘', 'W'], description: 'Close overlay, editor, or chat' },
      { keys: ['⌘', '1'], description: 'Workspace view' },
      { keys: ['⌘', '2'], description: 'Execute view' },
      { keys: ['⌘', '⌥', '0–9'], description: 'Switch project by position' },
    ],
  },
];

export function ShortcutsList() {
  return (
    <div className="space-y-4">
      {shortcuts.map((group) => (
        <div key={group.title}>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            {group.title}
          </h4>
          <div className="space-y-1.5">
            {group.shortcuts.map((shortcut, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIdx) => (
                    <kbd
                      key={keyIdx}
                      className="px-1.5 py-0.5 text-xs font-mono bg-surface-3 rounded border border-border-default text-text-secondary"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KeyboardShortcuts() {
  const setIsOpen = useSettingsUIStore((state) => state.setIsOpen);
  const setActiveTab = useSettingsUIStore((state) => state.setActiveTab);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (e.key === ',' && e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setActiveTab('general');
      setIsOpen(true);
    }
  }, [setActiveTab, setIsOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return null;
}
