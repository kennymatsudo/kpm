import { Modal, ModalBody, ModalHeader } from '../../ui/Modal';
import type { TrackerCredentialInfo, TrackerType } from '../../../../shared/types';
import { JiraConfigDialog } from './JiraConfigDialog';

interface Props {
  trackerType: TrackerType;
  credential: TrackerCredentialInfo | null;
  onClose: () => void;
}

function getTrackerLabel(trackerType: TrackerType): string {
  return trackerType === 'jira' ? 'Jira' : 'Linear';
}

export function TrackerConfigDialog({ trackerType, credential, onClose }: Props) {
  if (trackerType === 'jira') {
    return <JiraConfigDialog credential={credential} onClose={onClose} />;
  }

  const trackerLabel = getTrackerLabel(trackerType);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      aria-labelledby="tracker-config-title"
    >
      <ModalHeader id="tracker-config-title" onClose={onClose}>
        {trackerLabel} Settings
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-secondary">
          {trackerLabel} connection settings are not implemented yet.
        </div>
      </ModalBody>
    </Modal>
  );
}
