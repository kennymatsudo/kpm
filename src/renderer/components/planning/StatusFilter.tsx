import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import type { StatusCategory } from '../../../shared/types';
import { Z_INDEX } from '../../constants/zIndex';

interface StatusFilterProps {
  hiddenCategories: Set<StatusCategory>;
  onChange: (categories: Set<StatusCategory>) => void;
  /** Total work items */
  totalCount: number;
  /** Visible work items after filtering */
  visibleCount: number;
}

/** Status categories that can be filtered */
const FILTERABLE_CATEGORIES: StatusCategory[] = [
  'not_started',
  'in_progress',
  'in_review',
  'done',
];

/**
 * Dropdown filter for hiding plan items by status category.
 * Checkboxes toggle visibility - checked = visible, unchecked = hidden.
 */
export function StatusFilter({ hiddenCategories, onChange, totalCount, visibleCount }: StatusFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen(!isOpen);
  };

  const toggleCategory = (category: StatusCategory) => {
    const next = new Set(hiddenCategories);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    onChange(next);
  };

  const hasFilters = hiddenCategories.size > 0;
  const isFiltered = visibleCount < totalCount;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          hasFilters
            ? 'bg-accent-subtle text-accent'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
        }`}
      >
        Status {isFiltered ? `(${visibleCount}/${totalCount})` : totalCount > 0 ? `(${totalCount})` : ''}
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="fixed w-48 bg-surface-2 rounded-xl shadow-xl py-1"
          style={{ top: menuPosition.top, right: menuPosition.right, zIndex: Z_INDEX.dropdown }}
        >
          {FILTERABLE_CATEGORIES.map((category) => {
            const config = STATUS_CATEGORY_CONFIG[category];
            const isVisible = !hiddenCategories.has(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-surface-3"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    isVisible ? 'bg-accent border-accent' : 'border-border-default'
                  }`}
                >
                  {isVisible && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={`px-1.5 py-0.5 text-xxs font-medium rounded ${config.bgClass} ${config.textClass}`}>
                  {config.label}
                </span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
