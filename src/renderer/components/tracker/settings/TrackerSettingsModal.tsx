import { Modal, ModalHeader, ModalBody } from '../../ui/Modal';
import { useCredentialStore, useTrackerStore } from '../../../stores';
import { TrackerSidebar } from './TrackerSidebar';
import { ConnectionPanel } from './ConnectionPanel';
import { LinkedProjectPanel } from './LinkedProjectPanel';
import { LinkNewProjectPanel } from './LinkNewProjectPanel';

type SelectedItem = 'connection' | 'link-new' | { type: 'project'; associationId: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string | null;
  initialSelection?: SelectedItem;
}

export function TrackerSettingsModal({ isOpen, onClose, currentProjectId, initialSelection }: Props) {
  const { associations, loadAssociations } = useTrackerStore();

  const [selectedItem, setSelectedItem] = useState<SelectedItem>(
    initialSelection ?? 'connection'
  );

  // Note: Data is already loaded by TrackerSettings parent component.
  // We don't reload here to avoid triggering parent's loading state which would unmount this modal.

  // If no credentials, force connection panel
  const effectiveSelection = hasCredentials ? selectedItem : 'connection';

  // Filter associations to current project
  const projectAssociations = currentProjectId
    : [];

  const handleSelectItem = (item: SelectedItem) => {
    setSelectedItem(item);
  };

  const handleLinkComplete = () => {
    // After linking, refresh and select the connection panel
    if (currentProjectId) {
      void loadAssociations(currentProjectId);
    }
    setSelectedItem('connection');
  };

    // After unlinking, go back to connection
    setSelectedItem('connection');
    if (currentProjectId) {
      void loadAssociations(currentProjectId);
    }
  };

  const renderPanel = () => {
    if (effectiveSelection === 'connection') {
    }

    if (effectiveSelection === 'link-new') {
      return (
        <LinkNewProjectPanel
          key="link-new"
          projectId={currentProjectId!}
          onComplete={handleLinkComplete}
          onCancel={() => setSelectedItem('connection')}
        />
      );
    }

    if (effectiveSelection.type === 'project') {
      const association = projectAssociations.find(
        (a) => a.id === effectiveSelection.associationId
      );
      if (!association) {
      }
      return (
        <LinkedProjectPanel
          key={association.id}
          association={association}
          onUnlink={() => handleUnlink(association.id)}
        />
      );
    }

    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      className="max-h-[85vh]"
      aria-labelledby="tracker-settings-title"
    >
      <ModalHeader id="tracker-settings-title" onClose={onClose}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-info-muted flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-info" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.001 2C6.47813 2 2.00098 6.477 2.00098 12C2.00098 17.523 6.47813 22 12.001 22C17.5238 22 22.001 17.523 22.001 12C22.001 6.477 17.5238 2 12.001 2ZM10.001 16.5L6.00098 12.5L7.41498 11.086L10.001 13.672L16.587 7.086L18.001 8.5L10.001 16.5Z" />
            </svg>
          </div>
          Tracker Settings
        </div>
      </ModalHeader>

      <ModalBody className="p-0 flex min-h-[480px]">
        {/* Sidebar */}
        <TrackerSidebar
          hasCredentials={hasCredentials}
          associations={projectAssociations}
          selectedItem={effectiveSelection}
          onSelectItem={handleSelectItem}
          canLinkNew={hasCredentials && !!currentProjectId}
        />

        {/* Main Panel */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
              key={
                typeof effectiveSelection === 'string'
                  ? effectiveSelection
                  : effectiveSelection.associationId
              }
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="p-5"
            >
              {renderPanel()}
          </AnimatePresence>
        </div>
      </ModalBody>
    </Modal>
  );
}
