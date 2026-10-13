import { useEffect, useMemo, useState } from 'react';
import { useTrackerConfigStore } from '../../../../stores';
import type { CustomFieldValues, JiraCustomField, SyncReviewItem, TrackerType } from '../../../../../shared/types';

interface CustomFieldManagementDeps {
  projectKey: string | null;
  trackerType: TrackerType | null;
  selectedItem: SyncReviewItem | null;
}

interface CustomFieldManagementResult {
  customFields: JiraCustomField[];
  isLoadingCustomFields: boolean;
  customFieldsError: string | null;
  selectedIssueTypeId: string | null;
}

interface CustomFieldDraftDeps {
  item: SyncReviewItem;
  updateCustomFieldOverrides: (queueEntryId: string, overrides: CustomFieldValues | null) => Promise<void>;
}

interface CustomFieldDraftResult {
  customFieldDraft: CustomFieldValues;
  customFieldDirty: boolean;
  handleCustomFieldChange: (fieldId: string, value: string) => void;
  handleSaveCustomFields: () => Promise<void>;
  handleClearCustomFields: () => Promise<void>;
}

export function useCustomFieldManagement({
  projectKey,
  trackerType,
  selectedItem,
}: CustomFieldManagementDeps): CustomFieldManagementResult {
  const [customFields, setCustomFields] = useState<JiraCustomField[]>([]);
  const [isLoadingCustomFields, setIsLoadingCustomFields] = useState(false);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(null);
  const loadAvailableCustomFields = useTrackerConfigStore((state) => state.loadCustomFields);

  const selectedIssueTypeId = useMemo(() => {
    if (!selectedItem) return null;
    return selectedItem.queueEntry.target_issue_type_id ?? selectedItem.resolvedType?.id ?? null;
  }, [selectedItem]);
  const selectedOverrides = selectedItem?.queueEntry.custom_field_overrides ?? null;

  // Load custom fields for the selected issue type
  useEffect(() => {
    const loadFields = async () => {
      if (trackerType !== 'jira' || !projectKey || !selectedIssueTypeId) {
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
  }, [loadAvailableCustomFields, projectKey, selectedIssueTypeId, selectedOverrides, trackerType]);

  return {
    customFields,
    isLoadingCustomFields,
    customFieldsError,
    selectedIssueTypeId,
  };
}

/**
 * Holds the in-progress custom field edits. Call it from the component that
 * renders the inputs so each keystroke re-renders only that component.
 */
export function useCustomFieldDraft({ item, updateCustomFieldOverrides }: CustomFieldDraftDeps): CustomFieldDraftResult {
  const [customFieldDraft, setCustomFieldDraft] = useState<CustomFieldValues>(
    item.queueEntry.custom_field_overrides ?? {}
  );
  const [customFieldDirty, setCustomFieldDirty] = useState(false);

  // Reset custom field draft when selection changes
  useEffect(() => {
    setCustomFieldDraft(item.queueEntry.custom_field_overrides ?? {});
    setCustomFieldDirty(false);
  }, [item.queueEntry.id, item.queueEntry.custom_field_overrides]);

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
    const cleaned = Object.fromEntries(
      Object.entries(customFieldDraft).filter(([, value]) => value)
    );
    await updateCustomFieldOverrides(
      item.queueEntry.id,
      Object.keys(cleaned).length > 0 ? cleaned : null
    );
    setCustomFieldDirty(false);
  };

  const handleClearCustomFields = async () => {
    setCustomFieldDraft({});
    setCustomFieldDirty(false);
    await updateCustomFieldOverrides(item.queueEntry.id, null);
  };

  return {
    customFieldDraft,
    customFieldDirty,
    handleCustomFieldChange,
    handleSaveCustomFields,
    handleClearCustomFields,
  };
}
