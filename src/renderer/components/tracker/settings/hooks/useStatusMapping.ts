import { useEffect, useState } from 'react';
import { useTrackerConfigStore } from '../../../../stores';
import type { StatusMapping } from '../../../../../shared/types';

interface StatusMappingDeps {
  associationId: string;
  initialMapping: StatusMapping | null;
}

interface StatusMappingResult {
  statusMapping: StatusMapping;
  isSavingStatus: boolean;
  statusError: string | null;
  handleStatusMappingChange: (category: keyof StatusMapping, value: string) => void;
  handleSaveStatusMapping: () => Promise<{
    success: boolean;
    savedMapping: StatusMapping | null;
    error?: string;
  }>;
}

export function useStatusMapping({
  associationId,
  initialMapping,
}: StatusMappingDeps): StatusMappingResult {
  const [statusMapping, setStatusMapping] = useState<StatusMapping>(initialMapping ?? {});
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const saveStatusMapping = useTrackerConfigStore((state) => state.saveStatusMapping);

  useEffect(() => {
    setStatusMapping(initialMapping ?? {});
    setStatusError(null);
  }, [associationId, initialMapping]);

  function handleStatusMappingChange(category: keyof StatusMapping, value: string): void {
    setStatusMapping((prev) => ({
      ...prev,
      [category]: value || undefined,
    }));
  }

  async function handleSaveStatusMapping(): Promise<{
    success: boolean;
    savedMapping: StatusMapping | null;
    error?: string;
  }> {
    setIsSavingStatus(true);
    setStatusError(null);
    try {
      const result = await saveStatusMapping(associationId, statusMapping);
      if (!result.success) {
        setStatusError(result.error || 'Failed to save');
      }
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save';
      setStatusError(error);
      return { success: false, error, savedMapping: null };
    } finally {
      setIsSavingStatus(false);
    }
  }

  return {
    statusMapping,
    isSavingStatus,
    statusError,
    handleStatusMappingChange,
    handleSaveStatusMapping,
  };
}
