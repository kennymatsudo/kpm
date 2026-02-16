import type { ReactNode } from 'react';

interface SidebarSectionProps {
  title: string;
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
      className={`flex flex-col rounded-lg transition-all ${
        isDropZoneActive ? 'bg-accent/10 ring-2 ring-inset ring-accent ring-dashed mx-2' : ''
      } ${className}`}
      {...dropZoneProps}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 flex-1 hover:bg-surface-2/50 transition-colors rounded -mx-2 -my-1 px-2 py-1"
        >
          <svg
            className={`w-3 h-3 text-text-muted transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
          <span className="text-tiny font-medium text-text-muted uppercase tracking-wider">
            {title}
          </span>
          {count !== undefined && (
            <span className="text-xxs text-text-muted bg-surface-3 px-1.5 py-0.5 rounded-full ml-auto">
              {count}
            </span>
          )}
        </button>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isCollapsed
            ? 'max-h-0 opacity-0 flex-none'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
