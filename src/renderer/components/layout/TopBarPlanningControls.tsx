import { CloseIcon } from '../icons';
import { SearchInput } from '../planning/SearchInput';
import { StatusFilter } from '../planning/StatusFilter';
import { ViewSwitcher, type ViewMode } from '../planning/ViewSwitcher';
import type { StatusCategory } from '../../../shared/types';

interface TopBarPlanningControlsProps {
  isVisible: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedItemCount: number;
  onClearSelection: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResultCount: number | undefined;
  hiddenStatusCategories: Set<StatusCategory>;
  onHiddenStatusCategoriesChange: (categories: Set<StatusCategory>) => void;
  statusCounts: { total: number; visible: number };
}

export function TopBarPlanningControls({
  isVisible,
  viewMode,
  onViewModeChange,
  selectedItemCount,
  onClearSelection,
  searchQuery,
  onSearchChange,
  searchResultCount,
  hiddenStatusCategories,
  onHiddenStatusCategoriesChange,
  statusCounts,
}: TopBarPlanningControlsProps) {
  if (!isVisible) {
    return null;
  }

  return (
      <div className="flex-shrink-0">
        <ViewSwitcher value={viewMode} onChange={onViewModeChange} />
      </div>

      {selectedItemCount > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 bg-accent/10 rounded-md">
          <span className="text-xs font-medium text-accent whitespace-nowrap">{selectedItemCount} selected</span>
          <button
            onClick={onClearSelection}
            className="p-0.5 hover:bg-accent/20 rounded transition-colors"
            title="Clear selection"
            aria-label="Clear selection"
          >
            <CloseIcon className="w-3 h-3 text-accent" />
          </button>
        </div>
      )}

      <div className="flex-shrink min-w-[120px] max-w-[200px]">
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search items..."
          resultCount={searchResultCount}
        />
      </div>

      <div className="flex-shrink-0">
        <StatusFilter
          hiddenCategories={hiddenStatusCategories}
          onChange={onHiddenStatusCategoriesChange}
          totalCount={statusCounts.total}
          visibleCount={statusCounts.visible}
        />
      </div>
  );
}
