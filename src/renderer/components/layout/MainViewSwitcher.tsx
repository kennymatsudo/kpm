import { memo } from 'react';

export type MainView = 'planning' | 'workspace';

interface MainViewSwitcherProps {
  value: MainView;
  onChange: (view: MainView) => void;
}

interface ViewButtonConfig {
  id: MainView;
  label: string;
  title: string;
  iconPath: string;
}

const VIEW_BUTTONS: ViewButtonConfig[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    title: 'Workspace view',
    iconPath: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  {
    id: 'planning',
    label: 'Execute',
    title: 'Execute view',
    iconPath: 'M5 4h4v16H5zM11 4h4v10h-4zM17 4h4v6h-4z',
  },
];

/**
 * MainViewSwitcher - Toggle between Workspace and Execute views.
 *
 * Workspace: Chat-first interface with file browser and editor
 * Execute: Plan hierarchy, cards, tree, board views (board includes agentic execution)
 */
export const MainViewSwitcher = memo(function MainViewSwitcher({
  value,
  onChange,
}: MainViewSwitcherProps) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border-subtle rounded-md p-0.5 h-[26px]">
      {VIEW_BUTTONS.map((button) => {
        const isActive = value === button.id;
        const baseClass = 'inline-flex items-center gap-1.5 px-2.5 h-[22px] rounded-[5px] text-xs font-medium transition-colors duration-150';
        const stateClass = isActive
          ? 'bg-surface-elevated text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary';

        return (
          <button
            key={button.id}
            onClick={() => onChange(button.id)}
            className={`${baseClass} ${stateClass}`}
            title={button.title}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d={button.iconPath}
              />
            </svg>
            {button.label}
          </button>
        );
      })}
    </div>
  );
});
