import { useCredentialStore } from '../../../stores';
import { JiraLinkProjectForm } from '../linking/JiraLinkProjectForm';
import { LinearLinkProjectForm } from '../linking/LinearLinkProjectForm';
import type { TrackerType } from '../../../../shared/types';

interface Props {
  projectId: string;
  trackerType?: TrackerType;
  onComplete: () => void;
  onCancel: () => void;
}

function getTrackerLabel(trackerType: TrackerType): string {
  return trackerType === 'jira' ? 'Jira' : 'Linear';
}

export function LinkNewProjectPanel({
  projectId,
  trackerType = 'jira',
  onComplete,
  onCancel,
}: Props) {
  const { credentials } = useCredentialStore();
  const jiraCred = credentials.find((credential) => credential.type === 'jira');
  const siteUrl = jiraCred?.site_url || '';
  const trackerLabel = getTrackerLabel(trackerType);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Link {trackerLabel} Project</h3>
        <p className="text-sm text-text-secondary mt-1">
          Connect a {trackerLabel} {trackerType === 'linear' ? 'team' : 'project'} to sync issues with KPM
        </p>
      </div>
      {trackerType === 'jira' ? (
        <JiraLinkProjectForm
          projectId={projectId}
          siteUrl={siteUrl}
          onLinked={onComplete}
          onCancel={onCancel}
          variant="panel"
        />
      ) : (
        <LinearLinkProjectForm
          projectId={projectId}
          onLinked={onComplete}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
