import { useEffect } from 'react';
import { useTrackerStore } from '../../../../stores';
import type { CustomFieldValues, StatusMapping, TrackerType } from '../../../../../shared/types';

interface AssociationDataDeps {
  projectId: string;
  associationId: string;
}

interface AssociationDataResult {
  projectKey: string | null;
  trackerType: TrackerType | null;
  customFieldDefaults: CustomFieldValues | null;
  statusMapping: StatusMapping | null;
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
    trackerType: association?.tracker_type ?? null,
    customFieldDefaults: (association?.custom_field_values as CustomFieldValues | null) ?? null,
    statusMapping: association?.status_mapping ?? null,
  };
}
