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

  const [newLabel, setNewLabel] = useState('');
  const [selectedTypeForNew, setSelectedTypeForNew] = useState<string>('');


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

  // Loading state
    return (
          <div className="flex flex-col items-center">
            <p className="text-text-primary text-sm text-center">Loading type mappings...</p>
          </div>
        </div>
    );
  }

  // Error state for types
  if (typesError) {
    return (
            </div>
          </div>
        </div>
    );
  }

  return (

          </div>

            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            </p>
          </div>

              </svg>
          </div>

            </div>
        </div>

  );
}
