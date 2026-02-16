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

    if (!issueTypeId) {
      setCustomFields([]);
      return;
    }
    setIsLoadingFields(true);
    try {
      }
    } catch (e) {
    } finally {
      setIsLoadingFields(false);
    }
  }

  function handleIssueTypeChangeForFields(issueTypeId: string): void {
    setSelectedIssueTypeForFields(issueTypeId);
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

    setIsSavingFields(true);
    setFieldsError(null);
    try {
      if (!result.success) {
        setFieldsError(result.error || 'Failed to save');
      }
    } catch (e) {
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
