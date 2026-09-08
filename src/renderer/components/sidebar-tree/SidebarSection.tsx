import type { ReactNode } from 'react';
import { ChevronRightIcon } from '../icons';

interface SidebarSectionProps {
  title: string;
  /**
   * Glyph shown beside the title. Two lists of the same shape need more than a
   * word to tell them apart. Size it `w-3.5 h-3.5` — the header's alignment
   * math below assumes that width.
   */
  icon?: ReactNode;
  count?: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
  /** Optional action button in header */
  action?: ReactNode;
  /** Whether the drop zone is active (shows highlight on entire section) */
  isDropZoneActive?: boolean;
  /** Props to spread on the section for drop zone handling */
  dropZoneProps?: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** Additional className for the section container */
  className?: string;
}

/**
 * Collapsible section for sidebar content.
 * Used for Repos, Project Files, and similar sidebar groups.
 */
export function SidebarSection({
  title,
  icon,
  count,
  isCollapsed,
  onToggleCollapsed,
  children,
  action,
  isDropZoneActive = false,
  dropZoneProps,
  className = '',
}: SidebarSectionProps) {
  return (
    <div
      className={`flex flex-col rounded-sm ${
        isDropZoneActive ? 'bg-accent-subtle ring-1 ring-inset ring-accent mx-2' : ''
      } ${className}`}
      {...dropZoneProps}
    >
      {/*
        The header's left inset is computed to land the title on the row titles
        beneath it. A row's text starts at its margin (8) + padding (12) + icon
        (14) + gap (8) = 42px, so the header spends the same: 8px of padding,
        then a chevron (12) and a glyph (14) sharing one gapless column, then
        the same 8px gap. The right side keeps its wider inset — that edge
        answers to the panel, not to the rows.
      */}
      <div className="flex items-center gap-2 pl-2 pr-4 py-2">
        <button
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          className="flex items-center gap-2 flex-1 min-w-0 hover:bg-surface-3 transition-colors duration-150 rounded-sm -my-1 py-1"
        >
          <span className="flex items-center flex-shrink-0">
            <ChevronRightIcon
              className={`w-3 h-3 flex-shrink-0 text-text-tertiary transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
            />
            {icon}
          </span>
          <span className="min-w-0 text-tiny font-medium text-text-tertiary uppercase tracking-wider truncate">
            {title}
          </span>
          {count !== undefined && (
            <span className="text-xxs text-text-secondary bg-surface-3 px-1.5 py-0.5 rounded-full ml-auto">
              {count}
            </span>
          )}
        </button>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-opacity duration-150 ${
          isCollapsed
            ? 'max-h-0 opacity-0 flex-none'
            : `flex flex-1 min-h-0 flex-col opacity-100 pt-1 ${dropZoneProps ? 'pb-4' : ''}`
        }`}
      >
        {children}
      </div>
    </div>
  );
}
