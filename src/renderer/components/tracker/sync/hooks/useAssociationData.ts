import { useEffect } from 'react';
import { useTrackerStore } from '../../../../stores';

interface AssociationDataDeps {
  projectId: string;
  associationId: string;
}

interface AssociationDataResult {
  projectKey: string | null;
  customFieldDefaults: CustomFieldValues | null;
}

export function useAssociationData({ projectId, associationId }: AssociationDataDeps): AssociationDataResult {
  const association = useTrackerStore((state) => state.getAssociationById(associationId));
  const loadAssociations = useTrackerStore((state) => state.loadAssociations);

  useEffect(() => {
    if (!association) {
      void loadAssociations(projectId);
    }
  }, [association, loadAssociations, projectId]);

  return {
    projectKey: association?.project_key ?? null,
    customFieldDefaults: (association?.custom_field_values as CustomFieldValues | null) ?? null,
  };
}
