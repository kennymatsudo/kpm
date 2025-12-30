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
        dragImage.textContent = item.title;
        document.body.appendChild(dragImage);
        requestAnimationFrame(() => document.body.removeChild(dragImage));

        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {/* Breadcrumb (parent hierarchy) */}
      {breadcrumb.length > 0 && (
          {breadcrumb.map((crumb, index) => (
            <Fragment key={index}>
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
