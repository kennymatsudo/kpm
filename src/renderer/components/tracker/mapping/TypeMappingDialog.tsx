import { useEffect, useState } from 'react';

interface Props {
  projectId: string;
  scopeId: string;
  projectKey: string;
  onClose: () => void;
}

export function TypeMappingDialog({ projectId, scopeId, projectKey, onClose }: Props) {
  const {
    typeMappings,
    isLoadingMappings,
    error,
    loadMappingsByScope,
    saveMapping,
    removeMapping,
    clearError,

  // Use Zustand store for issue types (shared across dialogs, cached)

  // Local UI state
  const [newLabel, setNewLabel] = useState('');
  const [selectedTypeForNew, setSelectedTypeForNew] = useState<string>('');

  // Derived state
  const isLoadingTypes = isLoadingIssueTypes && jiraIssueTypes.length === 0;

  // Load mappings and issue types on mount (uses cached data if available)
  useEffect(() => {
    void loadMappingsByScope(projectId, scopeId);
  }, [projectId, scopeId, projectKey, loadMappingsByScope, loadIssueTypes]);

  const handleSaveMapping = async (kpmLabel: string, jiraTypeId: string) => {
    const jiraType = jiraIssueTypes.find(t => t.id === jiraTypeId);
    if (!jiraType) return;

    await saveMapping(projectId, scopeId, kpmLabel, jiraTypeId, jiraType.name);
  };

  const handleRemoveMapping = async (mappingId: string) => {
    await removeMapping(mappingId);
  };

  const handleAddMapping = async () => {
    if (!newLabel.trim() || !selectedTypeForNew) return;

    const jiraType = jiraIssueTypes.find(t => t.id === selectedTypeForNew);
    if (!jiraType) return;

    const result = await saveMapping(projectId, scopeId, newLabel.trim().toLowerCase(), selectedTypeForNew, jiraType.name);
    if (result.success) {
      setNewLabel('');
      setSelectedTypeForNew('');
    }
  };

  const handleClose = () => {
    clearError();
    onClose();
  };

  const isLoading = isLoadingMappings || isLoadingTypes;

  // Render custom header (shared across all states)
  const renderHeader = () => (
    <div className="dialog-header px-4 py-4 border-b">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-info-muted flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-text-primary tracking-tight truncate">
            Type Mappings
          </h2>
        </div>
        <button
          onClick={handleClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-all duration-150 cursor-pointer flex-shrink-0"
          aria-label="Close dialog"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      <p className="text-text-muted text-xs mt-1.5">
      </p>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <Modal isOpen={true} onClose={handleClose} size="sm" aria-labelledby="type-mapping-title">
        <div className="p-6">
          <div className="flex flex-col items-center">
            <LoadingSpinner className="w-6 h-6 text-info mb-3" />
            <p className="text-text-primary text-sm text-center">Loading type mappings...</p>
          </div>
        </div>
      </Modal>
    );
  }

  // Error state for types
  if (typesError) {
    return (
      <Modal isOpen={true} onClose={handleClose} size="sm" aria-labelledby="type-mapping-title">
        <div className="p-5">
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-xl bg-danger-muted flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-text-primary font-semibold text-sm mb-2">Failed to load issue types</h3>
            <p className="text-text-secondary text-xs mb-4">{typesError}</p>
            <button onClick={handleClose} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      size="md"
      className="max-h-[85vh] flex flex-col"
      aria-labelledby="type-mapping-title"
    >
      {renderHeader()}

      <ModalBody className="flex-1 overflow-y-auto">
        {typeMappings.length === 0 && (
          <div className="text-center py-6">
          </div>
        )}

        {/* Existing mappings */}
        {typeMappings.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Current Mappings
            </p>
            {typeMappings.map(mapping => (
              <div key={mapping.id} className="p-3 rounded-xl bg-surface-2">
                {/* Label row */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-text-primary text-sm font-medium">
                    {mapping.kpm_label}
                  </span>
                  <button
                    onClick={() => handleRemoveMapping(mapping.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-danger-muted transition-all duration-150 cursor-pointer flex-shrink-0"
                    title="Remove mapping"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Type selector */}
                  value={mapping.tracker_issue_type_id}
                >
              </div>
            ))}
          </div>
        )}

        {/* Add new mapping */}
        <div className="border-t border-border-default pt-4 mt-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            Add Mapping
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full bg-surface-3 text-text-primary text-sm rounded-lg px-3 py-2 border border-border-default focus:border-info focus:outline-none placeholder:text-text-muted"
            />
            >
            <button
              onClick={handleAddMapping}
              disabled={!newLabel.trim() || !selectedTypeForNew}
              className={`w-full py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all duration-150 ${
                newLabel.trim() && selectedTypeForNew
                  ? 'bg-info text-white hover:bg-info cursor-pointer'
                  : 'bg-surface-2 text-text-muted cursor-not-allowed'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Mapping</span>
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-surface-2 border border-border-default">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              </p>
              </ul>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm p-4 rounded-xl bg-danger-muted text-danger border border-danger/20 flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button onClick={handleClose} className="btn btn-secondary w-full">
          Done
        </button>
      </ModalFooter>
    </Modal>
  );
}
