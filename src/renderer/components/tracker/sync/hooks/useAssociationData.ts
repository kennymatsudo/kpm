
interface AssociationDataDeps {
  projectId: string;
  associationId: string;
}

interface AssociationDataResult {
  projectKey: string | null;
  customFieldDefaults: CustomFieldValues | null;
}

export function useAssociationData({ projectId, associationId }: AssociationDataDeps): AssociationDataResult {

  useEffect(() => {

  return {
  };
}
