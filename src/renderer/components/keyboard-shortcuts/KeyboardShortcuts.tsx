
interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const shortcuts: ShortcutGroup[] = [
  {
    shortcuts: [
      { keys: ['⌘', 'B'], description: 'Toggle sidebar' },
      { keys: ['⌘', 'L'], description: 'Toggle chat panel' },
      { keys: ['⌘', '⇧', 'I'], description: 'Create plan item' },
      { keys: ['⌘', '⇧', 'T'], description: 'Toggle tool log' },
    ],
  },
];

  return (
              </div>
        </div>
  );
}

export function KeyboardShortcuts() {

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

}
