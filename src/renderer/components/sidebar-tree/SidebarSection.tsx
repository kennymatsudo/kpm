
interface SidebarSectionProps {
  title: string;
  count?: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
  /** Optional action button in header */
  action?: ReactNode;
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
}: SidebarSectionProps) {
  return (
      {/* Section header */}
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
            {title}
          </span>
          {count !== undefined && (
              {count}
            </span>
          )}
        </button>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
        }`}
      >
        {children}
      </div>
    </div>
  );
}
