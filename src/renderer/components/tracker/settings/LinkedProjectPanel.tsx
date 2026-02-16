import { useState } from 'react';
import { m } from 'framer-motion';
import { LoadingSpinner } from '../../ui/LoadingButton';
import { CloseIcon } from '../../icons';
import {
  useJiraDataLoader,
  useStatusMapping,
  useEpicKey,
  useCustomFieldSettings,
  useUnlinkFlow,
} from './hooks';
import type {
  TrackerAssociationWithScope,
  StatusMapping,
  CustomFieldValues,
  JiraCustomField,
} from '../../../../shared/types';

type Tab = 'types' | 'statuses' | 'fields';

interface Props {
  association: TrackerAssociationWithScope;
  onUnlink: () => void;
}

export function LinkedProjectPanel({ association, onUnlink }: Props) {

  // Type mappings state (local to this component, used by TypeMappingsTab)
  const [newLabel, setNewLabel] = useState('');
  const [selectedTypeForNew, setSelectedTypeForNew] = useState('');

  const projectKey = association.project_key;
  const scopeId = association.scope_id;
  const projectId = association.kpm_project_id;

  const {
    jiraIssueTypes,
    isLoadingTypes,
    isLoadingStatuses,
    typeMappings,
    isLoadingMappings,
    saveMapping,
    removeMapping,
    statusesByCategory,

  const {
    statusMapping,
    isSavingStatus,
    statusError,
    handleStatusMappingChange,
    handleSaveStatusMapping,
  } = useStatusMapping({
    associationId: association.id,
    initialMapping: association.status_mapping,
  });

  const {
    epicKey,
    isSavingEpicKey,
    epicKeyError,
    setEpicKey,
    handleSaveEpicKey,
  } = useEpicKey({
    associationId: association.id,
    initialEpicKey: association.epic_key,
  });

  const {
    selectedIssueTypeForFields,
    customFields,
    customFieldValues,
    isLoadingFields,
    isSavingFields,
    fieldsError,
    handleIssueTypeChangeForFields,
    handleFieldValueChange,
    handleSaveCustomFields,
  } = useCustomFieldSettings({
    associationId: association.id,
    projectKey,
    initialValues: association.custom_field_values,
  });

  const {
    isUnlinking,
    showUnlinkConfirm,
    setShowUnlinkConfirm,
    handleUnlink,
  } = useUnlinkFlow({
    associationId: association.id,
    onUnlink,
  });

  const handleSaveTypeMapping = async (kpmLabel: string, jiraTypeId: string) => {
    const jiraType = jiraIssueTypes.find((t) => t.id === jiraTypeId);
    if (!jiraType) return;
    await saveMapping(projectId, scopeId, kpmLabel, jiraTypeId, jiraType.name);
  };

  const handleAddTypeMapping = async () => {
    if (!newLabel.trim() || !selectedTypeForNew) return;
    const jiraType = jiraIssueTypes.find((t) => t.id === selectedTypeForNew);
    if (!jiraType) return;
    const result = await saveMapping(
      projectId,
      scopeId,
      newLabel.trim().toLowerCase(),
      selectedTypeForNew,
      jiraType.name
    );
    if (result.success) {
      setNewLabel('');
      setSelectedTypeForNew('');
    }
  };

  function getCategoryLabel(key: string): string {
    switch (key) {
      case 'new':
        return 'To Do';
      case 'indeterminate':
        return 'In Progress';
      case 'done':
        return 'Done';
      default:
        return key;
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-text-primary">
            {association.display_name || association.project_name || projectKey}
          </h3>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-3 text-text-tertiary">
            {projectKey}
          </span>
        </div>
        <p className="text-sm text-text-secondary mt-1 font-mono text-xs bg-surface-2 px-2 py-1.5 rounded-lg mt-2">
          {association.jql_filter}
        </p>

            </div>
          </div>
            <button
            >
            </button>
        </div>

      {/* Tab content */}
      <m.div
        key={activeTab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
          <TypeMappingsTab
            typeMappings={typeMappings}
            jiraIssueTypes={jiraIssueTypes}
            isLoading={isLoadingMappings || isLoadingTypes}
            newLabel={newLabel}
            setNewLabel={setNewLabel}
            selectedTypeForNew={selectedTypeForNew}
            setSelectedTypeForNew={setSelectedTypeForNew}
            onSaveMapping={handleSaveTypeMapping}
            onRemoveMapping={removeMapping}
            onAddMapping={handleAddTypeMapping}
          />
        )}

        {activeTab === 'statuses' && (
          <StatusMappingsTab
            statusMapping={statusMapping}
            statusesByCategory={statusesByCategory}
            isLoading={isLoadingStatuses}
            isSaving={isSavingStatus}
            error={statusError}
            onMappingChange={handleStatusMappingChange}
            onSave={handleSaveStatusMapping}
            getCategoryLabel={getCategoryLabel}
          />
        )}

          <CustomFieldsTab
            jiraIssueTypes={jiraIssueTypes}
            selectedIssueType={selectedIssueTypeForFields}
            customFields={customFields}
            activeFieldValues={customFieldValues}
            isLoadingTypes={isLoadingTypes}
            isLoadingFields={isLoadingFields}
            isSaving={isSavingFields}
            error={fieldsError}
            onIssueTypeChange={handleIssueTypeChangeForFields}
            onFieldValueChange={handleFieldValueChange}
            onSave={handleSaveCustomFields}
          />
        )}
      </m.div>

      {/* Footer actions */}
      <div className="pt-4 border-t border-border-subtle">
        {showUnlinkConfirm ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-text-secondary flex-1">
            </p>
            <button
              onClick={() => setShowUnlinkConfirm(false)}
              className="btn btn-secondary"
              disabled={isUnlinking}
            >
              Cancel
            </button>
            <button onClick={handleUnlink} className="btn btn-danger" disabled={isUnlinking}>
              {isUnlinking ? (
                <>
                  <LoadingSpinner className="w-4 h-4" />
                  Unlinking...
                </>
              ) : (
                'Unlink'
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowUnlinkConfirm(true)}
            className="text-sm text-text-tertiary hover:text-danger transition-colors cursor-pointer"
          >
            Unlink project
          </button>
        )}
      </div>
    </div>
  );
}

// Type Mappings Tab Component
interface TypeMappingsTabProps {
  typeMappings: { id: string; kpm_label: string; tracker_issue_type_id: string }[];
  isLoading: boolean;
  newLabel: string;
  setNewLabel: (v: string) => void;
  selectedTypeForNew: string;
  setSelectedTypeForNew: (v: string) => void;
  onSaveMapping: (label: string, typeId: string) => Promise<void>;
  onRemoveMapping: (id: string) => Promise<void>;
  onAddMapping: () => Promise<void>;
}

function TypeMappingsTab({
  typeMappings,
  jiraIssueTypes,
  isLoading,
  newLabel,
  setNewLabel,
  selectedTypeForNew,
  setSelectedTypeForNew,
  onSaveMapping,
  onRemoveMapping,
  onAddMapping,
}: TypeMappingsTabProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-8">
        <LoadingSpinner className="w-5 h-5 text-accent mb-2" />
        <p className="text-text-muted text-sm">Loading type mappings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {typeMappings.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-text-muted text-sm mb-2">No custom type mappings</p>
          <p className="text-text-tertiary text-xs">
            Synced items preserve their Jira type. Local items use depth-based defaults.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Current Mappings
          </p>
          {typeMappings.map((mapping) => (
            <div key={mapping.id} className="p-3 rounded-xl bg-surface-2">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-text-primary text-sm font-medium">{mapping.kpm_label}</span>
                <button
                  onClick={() => onRemoveMapping(mapping.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-danger-muted transition-all cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
                value={mapping.tracker_issue_type_id}
              >
            </div>
          ))}
        </div>
      )}

      {/* Add new mapping */}
      <div className="border-t border-border-subtle pt-4">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
          Add Mapping
        </p>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (e.g., story, bug)..."
            className="input"
          />
          >
          <button
            onClick={onAddMapping}
            disabled={!newLabel.trim() || !selectedTypeForNew}
            className="btn btn-secondary w-full"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Mapping
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-text-tertiary">
          </div>
        </div>
      </div>
    </div>
  );
}

// Status Mappings Tab Component
interface StatusMappingsTabProps {
  statusMapping: StatusMapping;
  statusesByCategory: Record<string, { id: string; name: string; categoryKey: string }[]>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onMappingChange: (category: keyof StatusMapping, value: string) => void;
  getCategoryLabel: (key: string) => string;
}

function StatusMappingsTab({
  statusMapping,
  statusesByCategory,
  isLoading,
  isSaving,
  error,
  onMappingChange,
  onSave,
  getCategoryLabel,
}: StatusMappingsTabProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-8">
        <LoadingSpinner className="w-5 h-5 text-accent mb-2" />
        <p className="text-text-muted text-sm">Loading statuses...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
          <div key={category.key} className="p-3 rounded-xl bg-surface-2">
            <div className="mb-2">
              <span className="text-text-primary text-sm font-medium">{category.label}</span>
              <p className="text-text-tertiary text-xs">{category.description}</p>
            </div>
            >
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger-muted/50 border border-danger/20 text-sm text-danger">
          {error}
        </div>
      )}

      <button onClick={onSave} disabled={isSaving} className="btn btn-primary w-full">
        {isSaving ? (
          <>
            <LoadingSpinner className="w-4 h-4" />
            Saving...
          </>
        ) : (
          'Save Status Mappings'
        )}
      </button>

      {/* Info */}
      <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-text-tertiary">
            <p>Status mappings are used for:</p>
            <ul className="mt-1 ml-3 list-disc space-y-0.5">
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Custom Fields Tab Component
interface CustomFieldsTabProps {
  selectedIssueType: string;
  customFields: JiraCustomField[];
  activeFieldValues: CustomFieldValues;
  isLoadingTypes: boolean;
  isLoadingFields: boolean;
  isSaving: boolean;
  error: string | null;
  onIssueTypeChange: (typeId: string) => void;
  onFieldValueChange: (fieldId: string, value: string) => void;
}

function CustomFieldsTab({
  jiraIssueTypes,
  selectedIssueType,
  customFields,
  activeFieldValues,
  isLoadingTypes,
  isLoadingFields,
  isSaving,
  error,
  onIssueTypeChange,
  onFieldValueChange,
  onSave,
}: CustomFieldsTabProps) {
  if (isLoadingTypes) {
    return (
      <div className="flex flex-col items-center py-8">
        <LoadingSpinner className="w-5 h-5 text-accent mb-2" />
        <p className="text-text-muted text-sm">Loading issue types...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Issue Type Selector - just for browsing available fields */}
      <div>
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
          Browse Fields By Type
        </label>
        >
      </div>

      {/* Loading fields */}
      {isLoadingFields && (
        <div className="flex flex-col items-center py-8">
          <LoadingSpinner className="w-5 h-5 text-accent mb-2" />
          <p className="text-text-muted text-sm">Loading custom fields...</p>
        </div>
      )}

      {/* No issue type selected */}
      {!selectedIssueType && !isLoadingFields && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-text-muted text-sm">Select an issue type to configure custom fields</p>
        </div>
      )}

      {/* No fields available */}
      {selectedIssueType && !isLoadingFields && customFields.length === 0 && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-text-muted text-sm">No configurable custom fields for this type</p>
        </div>
      )}

      {/* Custom fields list */}
      {selectedIssueType && !isLoadingFields && customFields.length > 0 && (
        <div className="space-y-3">
          {customFields.map((field) => (
            <div key={field.id} className="p-3 rounded-xl bg-surface-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-text-primary text-sm font-medium">{field.name}</span>
                {field.required && (
                  <span className="px-1.5 py-0.5 text-xxs font-medium uppercase tracking-wider bg-danger-muted text-danger rounded">
                    Required
                  </span>
                )}
                <span className="px-1.5 py-0.5 text-xxs font-medium uppercase tracking-wider bg-surface-3 text-text-tertiary rounded ml-auto">
                  {field.type === 'option' ? 'Select' : 'Text'}
                </span>
              </div>
              {field.type === 'option' && field.allowedValues ? (
                >
              ) : (
                <input
                  type="text"
                  value={activeFieldValues[field.id] || ''}
                  onChange={(e) => onFieldValueChange(field.id, e.target.value)}
                  placeholder="Enter value..."
                  className="w-full bg-surface-3 text-text-primary text-xs rounded-lg px-2 py-1.5 border border-border-default focus:border-accent focus:outline-none placeholder:text-text-muted"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-danger-muted/50 border border-danger/20 text-sm text-danger">
          {error}
        </div>
      )}

      {selectedIssueType && customFields.length > 0 && (
        <button onClick={onSave} disabled={isSaving} className="btn btn-primary w-full">
          {isSaving ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Saving...
            </>
          ) : (
            'Save Custom Fields'
          )}
        </button>
      )}

      {/* Info */}
      <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-text-tertiary">
          </div>
        </div>
      </div>
    </div>
  );
}
