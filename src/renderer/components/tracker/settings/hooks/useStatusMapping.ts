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
}

export function useStatusMapping({
  associationId,
  initialMapping,
}: StatusMappingDeps): StatusMappingResult {
  const [statusMapping, setStatusMapping] = useState<StatusMapping>(initialMapping ?? {});
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  function handleStatusMappingChange(category: keyof StatusMapping, value: string): void {
    setStatusMapping((prev) => ({
      ...prev,
      [category]: value || undefined,
    }));
  }

    setIsSavingStatus(true);
    setStatusError(null);
    try {
      if (!result.success) {
        setStatusError(result.error || 'Failed to save');
      }
    } catch (e) {
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
