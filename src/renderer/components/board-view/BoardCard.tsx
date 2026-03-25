import { HighlightedText } from '../planning/HighlightedText';

export interface Breadcrumb {
  title: string;
  externalKey?: string;
}

interface BoardCardProps {
  item: PlanItem;
  breadcrumb: Breadcrumb[];
  isSelected: boolean;
  isFocused: boolean;
  searchQuery: string;
  onSelect: (addToSelection: boolean) => void;
  onEdit: () => void;
  onPrepareEdit?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/**
 * BoardCard - Individual card within a Kanban column
 *
 */
export const BoardCard = memo(function BoardCard({
  item,
  breadcrumb,
  isSelected,
  isFocused,
  searchQuery,
  onSelect,
  onEdit,
  onPrepareEdit,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: BoardCardProps) {
  // Search match detection
  const isSearchActive = searchQuery.trim().length > 0;
  const titleMatches = isSearchActive && item.title.toLowerCase().includes(searchQuery.toLowerCase());
  const keyMatches = isSearchActive && item.external_key?.toLowerCase().includes(searchQuery.toLowerCase());
  const isMatch = titleMatches || keyMatches;
  const isDimmed = isSearchActive && !isMatch;

  return (
    <div
      data-plan-item-id={item.id}
      draggable
      className={`
        ${isFocused && !isSelected ? 'ring-1 ring-accent/50' : ''}
        ${isDimmed ? 'opacity-40' : ''}
        group
      `}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onPrepareEdit?.();
        onEdit();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('board-item-id', item.id);
        e.dataTransfer.effectAllowed = 'move';

        const dragImage = document.createElement('div');
        dragImage.className =
          'px-3 py-2 bg-surface-elevated rounded-xl text-sm font-medium text-text-primary max-w-[220px] truncate';
        dragImage.style.cssText = `
          position: absolute;
          top: -1000px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.1);
          border: 1px solid var(--color-border-default);
          transform: rotate(-2deg);
        `;
        dragImage.textContent = item.title;
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 10, 10);
        requestAnimationFrame(() => document.body.removeChild(dragImage));

        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {/* Breadcrumb (parent hierarchy) */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-tiny text-text-muted mb-1.5 overflow-hidden">
          {breadcrumb.map((crumb, index) => (
            <Fragment key={index}>
              {index > 0 && <span className="flex-shrink-0 text-text-muted/50">/</span>}
              <span className="truncate min-w-0" title={crumb.title}>
                {crumb.externalKey || truncateTitle(crumb.title)}
              </span>
            </Fragment>
          ))}
        </div>
      )}

        )}
      </div>

              className="
              "
            >
              </svg>
        </div>
    </div>
  );
});

/**
 * Truncate title to a reasonable length for breadcrumb display
 */
function truncateTitle(title: string, maxLength = 18): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 2) + '...';
}
