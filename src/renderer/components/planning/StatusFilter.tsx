import { useState, useRef, useEffect } from 'react';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import type { StatusCategory } from '../../../shared/types';

interface StatusFilterProps {
  hiddenCategories: Set<StatusCategory>;
  onChange: (categories: Set<StatusCategory>) => void;
}

/**
 * Dropdown filter for hiding plan items by status category.
 * Checkboxes toggle visibility - checked = visible, unchecked = hidden.
 */
  const [isOpen, setIsOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);

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

  return (
      <button
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          hasFilters
            ? 'bg-accent-subtle text-accent'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
        }`}
      >
      </button>

            const isVisible = !hiddenCategories.has(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-surface-3"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                  }`}
                >
                  {isVisible && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                  {config.label}
                </span>
              </button>
            );
          })}
      )}
    </div>
  );
}
