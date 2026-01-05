import { memo } from 'react';

export type MainView = 'planning' | 'workspace';

interface MainViewSwitcherProps {
  value: MainView;
  onChange: (view: MainView) => void;
}

/**
 *
 * Workspace: Chat-first interface with file browser and editor
 */
export const MainViewSwitcher = memo(function MainViewSwitcher({
  value,
  onChange,
}: MainViewSwitcherProps) {
  return (

            className={`${baseClass} ${stateClass}`}
    </div>
  );
});
