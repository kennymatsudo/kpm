import { useEffect, useState } from 'react';
import { useTrackerConfigStore } from '../../../../stores';
import type { CustomFieldValues, JiraCustomField } from '../../../../../shared/types';

interface CustomFieldSettingsDeps {
  associationId: string;
  projectKey: string;
  initialValues: CustomFieldValues | null;
}

interface CustomFieldSettingsResult {
  selectedIssueTypeForFields: string;
  customFields: JiraCustomField[];
  customFieldValues: CustomFieldValues;
  isLoadingFields: boolean;
  isSavingFields: boolean;
  fieldsError: string | null;
  handleIssueTypeChangeForFields: (issueTypeId: string) => void;
  handleFieldValueChange: (fieldId: string, value: string) => void;
  handleSaveCustomFields: () => Promise<{
    success: boolean;
    savedValues: CustomFieldValues | null;
    error?: string;
  }>;
}

export function useCustomFieldSettings({
  associationId,
  projectKey,
  initialValues,
}: CustomFieldSettingsDeps): CustomFieldSettingsResult {
  const [selectedIssueTypeForFields, setSelectedIssueTypeForFields] = useState('');
  const [customFields, setCustomFields] = useState<JiraCustomField[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValues>(
    initialValues ?? {}
  );
  const [isSavingFields, setIsSavingFields] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const loadCustomFields = useTrackerConfigStore((state) => state.loadCustomFields);
  const saveCustomFieldValues = useTrackerConfigStore((state) => state.saveCustomFieldValues);

  useEffect(() => {
    setSelectedIssueTypeForFields('');
    setCustomFields([]);
    setCustomFieldValues(initialValues ?? {});
    setFieldsError(null);
  }, [associationId, initialValues]);

  async function handleLoadCustomFields(issueTypeId: string): Promise<void> {
    if (!issueTypeId) {
      setCustomFields([]);
      return;
    }
    setIsLoadingFields(true);
    setFieldsError(null);
    try {
      const result = await loadCustomFields(projectKey, issueTypeId, customFieldValues);
      if (result.success) {
        setCustomFields(result.fields || []);
        if (result.suggestedValues && Object.keys(result.suggestedValues).length > 0) {
          setCustomFieldValues((prev) => ({ ...result.suggestedValues, ...prev }));
        }
      } else {
        setFieldsError(result.error || 'Failed to load custom fields');
      }
    } catch (e) {
      setFieldsError(e instanceof Error ? e.message : 'Failed to load custom fields');
    } finally {
      setIsLoadingFields(false);
    }
  }

  function handleIssueTypeChangeForFields(issueTypeId: string): void {
    setSelectedIssueTypeForFields(issueTypeId);
    void handleLoadCustomFields(issueTypeId);
  }

  function handleFieldValueChange(fieldId: string, value: string): void {
    setCustomFieldValues((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[fieldId];
      } else {
        next[fieldId] = value;
      }
      return next;
    });
  }

  async function handleSaveCustomFields(): Promise<{
    success: boolean;
    savedValues: CustomFieldValues | null;
    error?: string;
  }> {
    setIsSavingFields(true);
    setFieldsError(null);
    try {
      const result = await saveCustomFieldValues(associationId, customFieldValues);
      if (!result.success) {
        setFieldsError(result.error || 'Failed to save');
      }
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save';
      setFieldsError(error);
      return { success: false, error, savedValues: null };
    } finally {
      setIsSavingFields(false);
    }
  }

  return {
    selectedIssueTypeForFields,
    customFields,
    customFieldValues,
    isLoadingFields,
    isSavingFields,
    fieldsError,
    handleIssueTypeChangeForFields,
    handleFieldValueChange,
    handleSaveCustomFields,
  };
}
