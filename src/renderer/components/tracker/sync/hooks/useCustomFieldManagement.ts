import { useEffect, useMemo, useState } from 'react';
import { useTrackerConfigStore } from '../../../../stores';
import type { CustomFieldValues, JiraCustomField, SyncReviewItem } from '../../../../../shared/types';

interface CustomFieldManagementDeps {
  projectKey: string | null;
  selectedItem: SyncReviewItem | null;
  updateCustomFieldOverrides: (queueEntryId: string, overrides: CustomFieldValues | null) => Promise<void>;
}

interface CustomFieldManagementResult {
  customFields: JiraCustomField[];
  isLoadingCustomFields: boolean;
  customFieldsError: string | null;
  customFieldDraft: CustomFieldValues;
  customFieldDirty: boolean;
  selectedIssueTypeId: string | null;
  handleCustomFieldChange: (fieldId: string, value: string) => void;
  handleSaveCustomFields: () => Promise<void>;
  handleClearCustomFields: () => Promise<void>;
}

export function useCustomFieldManagement({
  projectKey,
  selectedItem,
  updateCustomFieldOverrides,
}: CustomFieldManagementDeps): CustomFieldManagementResult {
  const [customFields, setCustomFields] = useState<JiraCustomField[]>([]);
  const [isLoadingCustomFields, setIsLoadingCustomFields] = useState(false);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(null);
  const [customFieldDraft, setCustomFieldDraft] = useState<CustomFieldValues>({});
  const [customFieldDirty, setCustomFieldDirty] = useState(false);
  const loadAvailableCustomFields = useTrackerConfigStore((state) => state.loadCustomFields);

  const selectedIssueTypeId = useMemo(() => {
    if (!selectedItem) return null;
    return selectedItem.queueEntry.target_issue_type_id ?? selectedItem.resolvedType?.id ?? null;
  }, [selectedItem]);
  const selectedOverrides = selectedItem?.queueEntry.custom_field_overrides ?? null;

  // Reset custom field draft when selection changes
  useEffect(() => {
    setCustomFieldDraft(selectedItem?.queueEntry.custom_field_overrides ?? {});
    setCustomFieldDirty(false);
  }, [selectedItem?.queueEntry.id, selectedItem?.queueEntry.custom_field_overrides]);

  // Load custom fields for the selected issue type
  useEffect(() => {
    const loadFields = async () => {
      if (!projectKey || !selectedIssueTypeId) {
        setCustomFields([]);
        setCustomFieldsError(null);
        setIsLoadingCustomFields(false);
        return;
      }

      setIsLoadingCustomFields(true);
      setCustomFieldsError(null);
      try {
        const result = await loadAvailableCustomFields(
          projectKey,
          selectedIssueTypeId,
          selectedOverrides
        );
        if (result.success) {
          setCustomFields(result.fields || []);
        } else {
          setCustomFields([]);
          setCustomFieldsError(result.error || 'Failed to load custom fields');
        }
      } catch (e) {
        setCustomFields([]);
        setCustomFieldsError(e instanceof Error ? e.message : 'Failed to load custom fields');
      } finally {
        setIsLoadingCustomFields(false);
      }
    };

    void loadFields();
  }, [loadAvailableCustomFields, projectKey, selectedIssueTypeId, selectedOverrides]);

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    setCustomFieldDraft((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[fieldId];
      } else {
        next[fieldId] = value;
      }
      return next;
    });
    setCustomFieldDirty(true);
  };

  const handleSaveCustomFields = async () => {
    if (!selectedItem) return;
    const cleaned = Object.fromEntries(
      Object.entries(customFieldDraft).filter(([, value]) => value)
    );
    await updateCustomFieldOverrides(
      selectedItem.queueEntry.id,
      Object.keys(cleaned).length > 0 ? cleaned : null
    );
    setCustomFieldDirty(false);
  };

  const handleClearCustomFields = async () => {
    if (!selectedItem) return;
    setCustomFieldDraft({});
    setCustomFieldDirty(false);
    await updateCustomFieldOverrides(selectedItem.queueEntry.id, null);
  };

  return {
    customFields,
    isLoadingCustomFields,
    customFieldsError,
    customFieldDraft,
    customFieldDirty,
    selectedIssueTypeId,
    handleCustomFieldChange,
    handleSaveCustomFields,
    handleClearCustomFields,
  };
}
