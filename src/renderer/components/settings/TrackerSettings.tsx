import { useState, useEffect } from 'react';
import { useCredentialStore, useTrackerStore } from '../../stores';
import { LoadingSpinner } from '../ui/LoadingButton';
import { TrackerSettingsModal } from '../tracker/settings';
import type {
  TrackerAssociationWithScope,
  TrackerCredentialInfo,
  TrackerType,
} from '../../../shared/types';

const TRACKER_TYPES: readonly TrackerType[] = ['jira', 'linear'] as const;

function trackerSubtitle(trackerType: TrackerType, credential: TrackerCredentialInfo | undefined): string {
  if (!credential) return 'Not Connected';
  if (trackerType === 'linear') return 'linear.app';
  return credential.site_url ?? 'Connected';
}

interface Props {
  currentProjectId: string;
}

/**
 * Single-tracker landing — pick Jira or Linear via the pill, see that tracker's
 * connection status and linked projects. The other tracker's state stays intact
 * in keytar; users can flip back any time via the toggle.
 */
export function TrackerSettings({ currentProjectId }: Props) {
  const {
    credentials,
    isLoading: isLoadingCreds,
    loadCredentials,
    selectedTrackerType,
    setSelectedTrackerType,
  } = useCredentialStore();
  const { associations, isLoadingAssociations, loadAssociations } = useTrackerStore();

  const [showFullSettings, setShowFullSettings] = useState(false);

  useEffect(() => {
    void loadCredentials();
    void loadAssociations(currentProjectId);
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

  const currentCredential = credentials.find((credential) => credential.type === selectedTrackerType);
  const hasCredentials = Boolean(currentCredential);
  const trackerLabel = trackerLabelFor(selectedTrackerType);
  const linkedEntity = selectedTrackerType === 'linear' ? 'team' : 'project';
  const linkedEntityPlural = selectedTrackerType === 'linear' ? 'teams' : 'projects';
  const projectAssociations = associations.filter(
    (a) => a.kpm_project_id === currentProjectId && a.tracker_type === selectedTrackerType
  );

  return (
    <div className="space-y-6">
      {/* Header + tracker-type toggle */}
      <div>
        <h3 className="text-base font-semibold text-text-primary">Tracker Integration</h3>
        <p className="text-sm text-text-secondary mt-1">
        </p>
        <div className="mt-3 flex gap-1 p-1 rounded-lg bg-surface-3 w-fit">
          {TRACKER_TYPES.map((trackerType) => (
            <button
              key={trackerType}
              onClick={() => setSelectedTrackerType(trackerType)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                selectedTrackerType === trackerType
                  ? 'bg-surface-1 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              <TrackerIcon trackerType={trackerType} className="w-3.5 h-3.5" />
              {trackerLabelFor(trackerType)}
            </button>
          ))}
        </div>
      </div>

      {/* Connection Status */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              hasCredentials ? 'bg-success-muted' : 'bg-surface-3'
            }`}
          >
            <TrackerIcon
              trackerType={selectedTrackerType}
              className={`w-5 h-5 ${hasCredentials ? 'text-success' : 'text-text-muted'}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${hasCredentials ? 'bg-success' : 'bg-text-muted'}`} />
              <span className="text-sm font-medium text-text-primary">
                {hasCredentials ? `Connected to ${trackerLabel}` : `${trackerLabel} – Not Connected`}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5 truncate">
              {trackerSubtitle(selectedTrackerType, currentCredential)}
            </p>
          </div>
          <button onClick={() => setShowFullSettings(true)} className="btn btn-secondary text-sm">
            {hasCredentials ? 'Manage' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Linked Projects for the active tracker */}
      {hasCredentials && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-text-primary">Linked {trackerLabel} {selectedTrackerType === 'linear' ? 'Teams' : 'Projects'}</h4>
            <span className="text-xs text-text-muted">{projectAssociations.length} linked</span>
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
                No {trackerLabel} {linkedEntityPlural} linked yet
              </p>
              <button onClick={() => setShowFullSettings(true)} className="btn btn-primary text-sm">
                Link a {linkedEntity === 'team' ? 'Team' : 'Project'}
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Link Another {linkedEntity === 'team' ? 'Team' : 'Project'}
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
          <TrackerIcon trackerType={association.tracker_type} className="w-4 h-4 text-info" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {association.display_name || association.project_name || association.project_key}
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
