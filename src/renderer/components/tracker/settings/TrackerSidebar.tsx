import type { TrackerAssociationWithScope, TrackerType } from '../../../../shared/types';

type SelectedItem = 'connection' | 'link-new' | { type: 'project'; associationId: string };

interface Props {
  trackerType: TrackerType;
  hasCredentials: boolean;
  associations: TrackerAssociationWithScope[];
  selectedItem: SelectedItem;
  onSelectItem: (item: SelectedItem) => void;
  onSelectTrackerType: (trackerType: TrackerType) => void;
  canLinkNew: boolean;
}

export function TrackerSidebar({
  trackerType,
  hasCredentials,
  associations,
  selectedItem,
  onSelectItem,
  onSelectTrackerType,
  canLinkNew,
}: Props) {
  const isConnectionSelected = selectedItem === 'connection';
  const isLinkNewSelected = selectedItem === 'link-new';

  return (
    <div className="w-52 flex-shrink-0 bg-surface-2/50 border-r border-border-subtle p-3 flex flex-col">
      <div className="mb-3">
        <p className="text-xxs font-medium uppercase tracking-wider text-text-muted mb-2 px-1">
          Tracker
        </p>
        <div className="flex gap-1 p-1 rounded-lg bg-surface-3">
        </div>
      </div>

      {/* Connection item */}
      <button
        onClick={() => onSelectItem('connection')}
        className={`
          w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 cursor-pointer
          ${isConnectionSelected
            ? 'bg-accent-subtle text-text-primary'
            : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
          }
        `}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isConnectionSelected ? 'bg-accent-muted' : 'bg-surface-3'
            }`}
          >
            <svg
              className={`w-3.5 h-3.5 ${isConnectionSelected ? 'text-accent' : 'text-text-tertiary'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">Connection</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasCredentials ? 'bg-success' : 'bg-text-muted'
                }`}
              />
              <span className="text-xs text-text-tertiary">
                {hasCredentials ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Divider */}
      {associations.length > 0 && (
        <div className="my-3 mx-2">
          <div className="h-px bg-gradient-to-r from-transparent via-border-default to-transparent" />
          <p className="text-xxs font-medium uppercase tracking-wider text-text-muted mt-3 mb-1 px-1">
            Linked Projects
          </p>
        </div>
      )}

      {/* Linked projects */}
      <div className="flex-1 space-y-1 overflow-y-auto">
        {associations.map((association) => {
          const isSelected =
            typeof selectedItem === 'object' &&
            selectedItem.type === 'project' &&
            selectedItem.associationId === association.id;

          return (
            <button
              key={association.id}
              onClick={() => onSelectItem({ type: 'project', associationId: association.id })}
              className={`
                w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 cursor-pointer
                ${isSelected
                  ? 'bg-accent-subtle text-text-primary'
                  : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary hover:translate-x-0.5'
                }
              `}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-info-muted' : 'bg-surface-3'
                  }`}
                >
                  <TrackerIcon
                    trackerType={association.tracker_type}
                    className={`w-3.5 h-3.5 ${isSelected ? 'text-info' : 'text-text-tertiary'}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {association.display_name || association.project_name || association.project_key}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xxs font-mono px-1 py-0.5 rounded bg-surface-3 text-text-tertiary">
                      {association.project_key}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Link new project button */}
      {canLinkNew && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <button
            onClick={() => onSelectItem('link-new')}
            className={`
              w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer
              ${isLinkNewSelected
                ? 'bg-accent-subtle text-accent'
                : 'text-text-tertiary hover:text-accent hover:bg-accent-subtle/50'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Link Project
          </button>
        </div>
      )}

      {/* No credentials hint */}
      {!hasCredentials && (
        <div className="mt-3 p-2.5 rounded-lg bg-warning-muted/50 border border-warning/20">
          <p className="text-xs text-warning">
            Connect to {trackerType === 'jira' ? 'Jira' : 'Linear'} first to link projects
          </p>
        </div>
      )}
    </div>
  );
}
