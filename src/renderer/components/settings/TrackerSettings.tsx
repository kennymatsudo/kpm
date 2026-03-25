import { useState, useEffect } from 'react';
import { useCredentialStore, useTrackerStore } from '../../stores';
import { LoadingSpinner } from '../ui/LoadingButton';
import { TrackerSettingsModal } from '../tracker/settings';

interface Props {
  currentProjectId: string;
}

export function TrackerSettings({ currentProjectId }: Props) {
  const {
    credentials,
    isLoading: isLoadingCreds,
    loadCredentials,
    selectedTrackerType,
  } = useCredentialStore();
  const { associations, isLoadingAssociations, loadAssociations } = useTrackerStore();

  const [showFullSettings, setShowFullSettings] = useState(false);

  useEffect(() => {
  }, [currentProjectId, loadCredentials, loadAssociations]);

  const isLoading = isLoadingCreds || isLoadingAssociations;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner className="w-6 h-6 text-accent mb-3" />
        <p className="text-text-secondary text-sm">Loading tracker settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Tracker Integration</h3>
        <p className="text-sm text-text-secondary mt-1">
        </p>
      </div>

      {/* Connection Status */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              hasCredentials ? 'bg-success-muted' : 'bg-surface-3'
            }`}
          >
              className={`w-5 h-5 ${hasCredentials ? 'text-success' : 'text-text-muted'}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">
              </span>
            </div>
          </div>
            {hasCredentials ? 'Manage' : 'Connect'}
          </button>
        </div>
      </div>

      {hasCredentials && (
        <div>
          <div className="flex items-center justify-between mb-3">
          </div>

          {projectAssociations.length === 0 ? (
            <div className="p-6 rounded-xl bg-surface-2 border border-border-subtle text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center mx-auto mb-3">
                <svg
                  className="w-6 h-6 text-text-tertiary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </div>
              <p className="text-sm text-text-secondary mb-3">
              </p>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {projectAssociations.map((association) => (
                <LinkedProjectCard
                  key={association.id}
                  association={association}
                  onManage={() => setShowFullSettings(true)}
                />
              ))}
              <button
                onClick={() => setShowFullSettings(true)}
                className="w-full p-3 rounded-xl border border-dashed border-border-default text-sm text-text-tertiary hover:text-accent hover:border-accent/50 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {showFullSettings && (
        <TrackerSettingsModal
          isOpen={showFullSettings}
          onClose={() => setShowFullSettings(false)}
          currentProjectId={currentProjectId}
        />
      )}
    </div>
  );
}

function LinkedProjectCard({
  association,
  onManage,
}: {
  association: TrackerAssociationWithScope;
  onManage: () => void;
}) {
  return (
    <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center flex-shrink-0">
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
          </p>
          <p className="text-xs text-text-tertiary font-mono truncate mt-0.5">
            {association.jql_filter}
          </p>
        </div>
        <button
          onClick={onManage}
          className="text-xs text-text-tertiary hover:text-accent transition-colors cursor-pointer"
        >
          Configure
        </button>
      </div>
    </div>
  );
}
