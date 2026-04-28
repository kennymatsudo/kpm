/**
 * SearchableSelect — single-select dropdown with inline search.
 *
 * The native `<select>` element can't show a filter as you type — the user has
 * to open the dropdown to see filtered options. This component fuses the search
 * box and the option list so typing immediately shows matches.
 *
 * Co-located with the Linear link form because that's the only place using it
 * today (team picker + project picker = two uses in one form). Extract to
 * `components/ui/` if a third use shows up.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props<T> {
  options: T[];
  value: T | null;
  onChange: (value: T | null) => void;
  getKey: (option: T) => string;
  /** What appears in the input when this option is selected, and in the row. */
  getLabel: (option: T) => string;
  /** Optional secondary text rendered next to the label (e.g. team key). */
  getMeta?: (option: T) => string | null;
  /** Defaults to `getLabel`. Override when the searchable surface differs from the visible label. */
  getSearchText?: (option: T) => string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Show a "Clear" affordance that resets the value to null. */
  allowClear?: boolean;
}

export function SearchableSelect<T>({
  options,
  value,
  onChange,
  getKey,
  getLabel,
  getMeta,
  getSearchText,
  placeholder = 'Select…',
  emptyMessage = 'No matches',
  disabled,
  allowClear,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const searchOf = getSearchText ?? getLabel;
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter((o) => searchOf(o).toLowerCase().includes(normalized))
    : options;
  const lastActiveIndex = Math.max(0, filtered.length - 1);

  const selectedLabel = value ? getLabel(value) : '';

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  // Outside click closes the dropdown.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  // Keep the active-row cursor inside the visible list as it shrinks/grows.
  useEffect(() => {
    if (activeIndex > lastActiveIndex) {
      setActiveIndex(lastActiveIndex);
    }
  }, [activeIndex, lastActiveIndex]);

  // Scroll the active row into view on keyboard nav.
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const rows = listRef.current.querySelectorAll('[data-row]');
    rows[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const select = (option: T) => {
    onChange(option);
    close();
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={isOpen ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setActiveIndex((i) => Math.min(i + 1, lastActiveIndex));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            if (isOpen && filtered[activeIndex]) {
              e.preventDefault();
              select(filtered[activeIndex]);
            }
          } else if (e.key === 'Escape') {
            close();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="input pr-7"
      />

      {allowClear && value && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
            close();
          }}
          aria-label="Clear selection"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary text-base leading-none cursor-pointer"
        >
          ×
        </button>
      )}

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-1 border border-border-default rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-tertiary">{emptyMessage}</div>
          ) : (
            filtered.map((option, i) => {
              const isSelected = value != null && getKey(value) === getKey(option);
              const meta = getMeta?.(option);
              return (
                <button
                  key={getKey(option)}
                  type="button"
                  data-row
                  // onMouseDown so we select before the input's blur closes the dropdown.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(option);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                    i === activeIndex
                      ? 'bg-surface-3 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-3'
                  } ${isSelected ? 'font-medium' : ''}`}
                >
                  <span className="truncate">{getLabel(option)}</span>
                  {meta && (
                    <span className="text-xs text-text-tertiary ml-2 shrink-0">{meta}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
