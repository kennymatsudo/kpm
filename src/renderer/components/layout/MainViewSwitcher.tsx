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
  },
];

/**
 *
 * Workspace: Chat-first interface with file browser and editor
 */
export const MainViewSwitcher = memo(function MainViewSwitcher({
  value,
  onChange,
}: MainViewSwitcherProps) {
  return (
      {VIEW_BUTTONS.map((button) => {
        const isActive = value === button.id;
        const stateClass = isActive

        return (
          <button
            key={button.id}
            onClick={() => onChange(button.id)}
            className={`${baseClass} ${stateClass}`}
            title={button.title}
          >
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
