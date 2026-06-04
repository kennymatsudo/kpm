import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '../../constants/zIndex';
import type { PersonFilterOption } from '../layout/hooks/useLayoutPlanViewState';

interface PeopleFilterProps {
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  options: PersonFilterOption[];
}

const roleLabel: Record<PersonFilterOption['role'], string> = {
  assignee: 'Assigned to',
  creator: 'Created by',
};

export function PeopleFilter({ selectedKeys, onChange, options }: PeopleFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setIsOpen(!isOpen);
  };

  const toggleKey = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  const hasFilters = selectedKeys.size > 0;
  const grouped = {
    assignee: options.filter((option) => option.role === 'assignee'),
    creator: options.filter((option) => option.role === 'creator'),
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={options.length === 0 && selectedKeys.size === 0}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          hasFilters
            ? 'bg-accent-subtle text-accent'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
        }`}
      >
        People {hasFilters ? `(${selectedKeys.size})` : ''}
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="fixed w-64 max-h-[420px] overflow-y-auto bg-surface-2 rounded-xl shadow-xl py-1"
          style={{ top: menuPosition.top, right: menuPosition.right, zIndex: Z_INDEX.dropdown }}
        >
          {selectedKeys.size > 0 && (
            <button
              onClick={() => onChange(new Set())}
              className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-surface-3 border-b border-border-subtle"
            >
              Clear people filters
            </button>
          )}
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-muted">No tracker people</div>
          ) : (
            (['assignee', 'creator'] as const).map((role) => grouped[role].length > 0 && (
              <div key={role} className="py-1">
                <div className="px-3 py-1 text-xxs uppercase tracking-wide text-text-muted">{roleLabel[role]}</div>
                {grouped[role].map((option) => {
                  const selected = selectedKeys.has(option.key);
                  return (
                    <button
                      key={option.key}
                      onClick={() => toggleKey(option.key)}
                      className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-surface-3"
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          selected ? 'bg-accent border-accent' : 'border-border-default'
                        }`}
                      >
                        {selected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="truncate flex-1 text-text-primary">{option.name}</span>
                      <span className="text-xxs text-text-muted">{option.count}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
