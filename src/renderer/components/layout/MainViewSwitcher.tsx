import { memo, type ComponentType } from 'react';
import { BoardColumnsIcon, SplitPaneIcon } from '../icons';
import { Tooltip } from '../ui';

export type MainView = 'planning' | 'workspace';

interface MainViewSwitcherProps {
  value: MainView;
  onChange: (view: MainView) => void;
}

interface ViewButtonConfig {
  id: MainView;
  label: string;
  /** Names what is inside the view, since the label alone already names the view. */
  description: string;
  Icon: ComponentType<{ className?: string }>;
}

const VIEW_BUTTONS: ViewButtonConfig[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Files, documents, and chat',
    Icon: SplitPaneIcon,
  },
  {
    id: 'planning',
    label: 'Execute',
    description: 'Plan board, outline, and agent runs',
    Icon: BoardColumnsIcon,
  },
];

/**
 * MainViewSwitcher - Toggle between Workspace and Execute views.
 *
 * Workspace: Chat-first interface with file browser and editor
 * Execute: Board and tree views over the plan (board includes agentic execution)
 */
export const MainViewSwitcher = memo(function MainViewSwitcher({
  value,
  onChange,
}: MainViewSwitcherProps) {
  return (
    <div className="inline-flex items-center bg-surface-2 border border-border-subtle rounded-md p-0.5 h-[26px]">
      {VIEW_BUTTONS.map((button) => {
        const isActive = value === button.id;
        const baseClass = 'inline-flex items-center gap-1.5 px-2.5 h-[22px] rounded-sm text-xs font-medium transition-colors duration-150';
        const stateClass = isActive
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-secondary hover:text-text-primary';

        return (
          <Tooltip key={button.id} content={button.description} side="bottom">
            <button
              onClick={() => onChange(button.id)}
              className={`${baseClass} ${stateClass}`}
              aria-pressed={isActive}
            >
              <button.Icon className="w-3 h-3" />
              {button.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
});
