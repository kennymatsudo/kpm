import { useEffect } from 'react';
import { useProjectDomainStore } from '../../../stores';
import type { TrackerType } from '../../../../shared/types';
import { CloseIcon } from '../../icons';
import { Z_INDEX } from '../../../constants/zIndex';
import { JiraLinkProjectForm } from '../linking/JiraLinkProjectForm';
import { LinearLinkProjectForm } from '../linking/LinearLinkProjectForm';
import { TrackerIcon, trackerLabelFor } from '../shared/trackerDisplay';

interface Props {
  trackerType: TrackerType;
  siteUrl: string;
  onClose: () => void;
}

export function TrackerLinkProjectDialog({ trackerType, siteUrl, onClose }: Props) {
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const trackerLabel = trackerLabelFor(trackerType);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay p-4" style={{ zIndex: Z_INDEX.panel }}>
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="dialog-content relative flex flex-col overflow-hidden" style={{ maxWidth: '32rem', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="dialog-header px-6 py-5 border-b border-border-default flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center">
              <TrackerIcon trackerType={trackerType} className="w-4 h-4 text-info" />
            </div>
            <h2 className="text-base font-semibold text-text-primary tracking-tight">
              Link {trackerLabel} {trackerType === 'linear' ? 'Team' : 'Project'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-all duration-150 cursor-pointer"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {trackerType === 'jira' ? (
            <JiraLinkProjectForm
              projectId={currentProjectId}
              siteUrl={siteUrl}
              onLinked={onClose}
              onCancel={onClose}
              variant="dialog"
            />
          ) : (
            <LinearLinkProjectForm
              projectId={currentProjectId}
              onLinked={onClose}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
