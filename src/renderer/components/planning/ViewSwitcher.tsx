import { memo } from 'react';

export type ViewMode = 'card' | 'tree' | 'board';

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 * ViewSwitcher - Toggle between Board, Card, and Tree views
 *
 * Design: Pill-shaped toggle with subtle active state, matching KPM's
 * refined minimalism aesthetic.
 */
export const ViewSwitcher = memo(function ViewSwitcher({
  value,
  onChange,
}: ViewSwitcherProps) {
  return (
    <div className="flex items-center bg-surface-2 rounded-lg p-0.5 shadow-inset">
      {/* Board View */}
      <button
        onClick={() => onChange('board')}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${value === 'board'
            ? 'bg-surface-1 text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'}
        `}
        title="Board view (kanban)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
          />
        </svg>
        Board
      </button>

      {/* Card View */}
      <button
        onClick={() => onChange('card')}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${value === 'card'
            ? 'bg-surface-1 text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'}
        `}
        title="Card view (spatial canvas)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
          />
        </svg>
        Cards
      </button>

      {/* Tree View */}
      <button
        onClick={() => onChange('tree')}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
          transition-all duration-200
          ${value === 'tree'
            ? 'bg-surface-1 text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'}
        `}
        title="Tree view (outline)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.008v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.008v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
        Tree
      </button>
    </div>
  );
});
