import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Z_INDEX } from '../../constants/zIndex';
import { Badge } from '../ui/Badge';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { WarningTriangleIcon } from '../icons';
import { usePiProviderPicker } from './usePiProviderPicker';
import { getPiOptionDisplay, piProviderModelSelector } from '../../stores/chat/piProviderSelection';

// Above this many options the dropdown gets a filter box; a shorter list is
// easier to scan than a search field.
const SEARCH_MIN_OPTIONS = 8;

/**
 * Composer model control for the pi.dev provider — the counterpart to the
 * Sonnet/Opus {@link ModelSelector} for Claude. Rendered only when the active
 * provider is `pi`; the provider itself is chosen in Settings.
 */
export function PiModelPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    piProviders,
    selectedOption,
    pendingUnsafeOption,
    isStreaming,
    selectOption,
    confirmPendingUnsafeSelection,
    cancelPendingUnsafeSelection,
  } = usePiProviderPicker();

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Reset the filter and focus the search box each time the menu opens.
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Persistent indicator: visible whenever the active pi selection is unsafe,
  // not just while picking one.
  const isUnsafeActive = selectedOption ? !selectedOption.safe : false;
  const selectedSelector = selectedOption ? piProviderModelSelector(selectedOption) : null;
  const selectedDisplay = selectedOption ? getPiOptionDisplay(selectedOption) : null;
  const selectedAriaLabel = selectedDisplay
    ? `pi.dev provider and model: ${selectedDisplay.secondary ? `${selectedDisplay.secondary} — ` : ''}${selectedDisplay.primary}`
    : 'pi.dev provider and model';

  const showSearch = piProviders.length > SEARCH_MIN_OPTIONS;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProviders = normalizedQuery
    ? piProviders.filter((option) => {
        const display = getPiOptionDisplay(option);
        const haystack = `${display.primary} ${display.secondary ?? ''} ${option.provider} ${option.modelId} ${option.modelName ?? ''} ${option.label}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : piProviders;

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && filteredProviders.length > 0) {
      event.preventDefault();
      selectOption(filteredProviders[0]);
      setIsOpen(false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={isStreaming || piProviders.length === 0}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg text-tiny font-medium max-w-[180px]
          transition-colors duration-150
          ${isOpen ? 'bg-accent-subtle text-accent' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'}
          disabled:opacity-40 disabled:cursor-not-allowed
        `}
        title={
          selectedOption
            ? isUnsafeActive
              ? `${selectedOption.label} — runs its own agent and can modify repo files or run commands from chat`
              : selectedOption.label
            : 'Select a pi.dev provider'
        }
        aria-label={selectedAriaLabel}
        aria-expanded={isOpen}
      >
        {isUnsafeActive && <WarningTriangleIcon className="w-3.5 h-3.5 text-warning flex-shrink-0" />}
        <span className="min-w-0 flex flex-1 flex-col leading-tight text-left">
          <span className="truncate">{selectedDisplay?.primary ?? 'Select provider'}</span>
          {selectedDisplay?.secondary && (
            <span className="truncate text-[10px] font-normal opacity-80">{selectedDisplay.secondary}</span>
          )}
        </span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="dropdown-menu absolute left-0 bottom-full mb-1.5 w-64"
          style={{ zIndex: Z_INDEX.dropdown, boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-border-default)' }}
        >
          {showSearch && (
            <div className="p-1.5 border-b border-border-subtle">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search models…"
                aria-label="Search pi.dev models"
                className="w-full px-2 py-1 text-sm rounded-md bg-surface-2 text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto py-1">
            {filteredProviders.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-muted">No matching models</div>
            ) : (
              filteredProviders.map((option) => {
                const selector = piProviderModelSelector(option);
                const isSelected = selectedSelector === selector;
                const display = getPiOptionDisplay(option);
                return (
                  <button
                    key={selector}
                    onClick={() => {
                      selectOption(option);
                      setIsOpen(false);
                    }}
                    className="dropdown-item w-full text-left"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="min-w-0 flex flex-1 flex-col leading-tight">
                        <span className={`text-sm truncate ${isSelected ? 'text-accent font-medium' : 'text-text-primary'}`}>
                          {display.primary}
                        </span>
                        {display.secondary && (
                          <span className="truncate text-xs text-text-tertiary">{display.secondary}</span>
                        )}
                      </span>
                      {!option.safe && (
                        <Badge variant="warning" size="sm" icon={<WarningTriangleIcon className="w-3 h-3" />}>Unsafe</Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {pendingUnsafeOption && (
        <ConfirmActionDialog
          title="Enable an unsafe pi.dev provider?"
          message={
            <>
              <span className="text-text-primary font-medium">{pendingUnsafeOption.label}</span> runs its own agent
              and can modify your repo files or run commands from chat. KPM cannot prevent this.
            </>
          }
          dialogId="pi-unsafe-provider-dialog"
          onCancel={cancelPendingUnsafeSelection}
          action={{
            label: 'Enable anyway',
            loadingText: 'Enabling...',
            variant: 'danger',
            onClick: confirmPendingUnsafeSelection,
            ariaLabel: `Acknowledge and enable ${pendingUnsafeOption.label}`,
          }}
        />
      )}
    </div>
  );
}
