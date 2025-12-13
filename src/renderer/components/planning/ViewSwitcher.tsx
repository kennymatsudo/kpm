import { memo } from 'react';


interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 *
 * refined minimalism aesthetic.
 */
export const ViewSwitcher = memo(function ViewSwitcher({
  value,
  onChange,
}: ViewSwitcherProps) {
  return (
    <div className="flex items-center bg-surface-2 rounded-lg p-0.5 shadow-inset">
      <button
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
            ? 'bg-surface-1 text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'}
        `}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </svg>
      </button>

      <button
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
            ? 'bg-surface-1 text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'}
        `}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </svg>
      </button>
    </div>
  );
});
