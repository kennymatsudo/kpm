import { useExportStore } from '../../../../stores';

interface JiraDataLoaderDeps {
  projectId: string;
  scopeId: string;
  projectKey: string;
}

type SaveMappingFn = (
  projectId: string,
  scopeId: string,
  kpmLabel: string,
  jiraIssueTypeId: string,
  jiraIssueTypeName: string
) => Promise<{ success: boolean; error?: string }>;

interface JiraDataLoaderResult {
  isLoadingTypes: boolean;
  isLoadingStatuses: boolean;
  typeMappings: TrackerTypeMapping[];
  isLoadingMappings: boolean;
  saveMapping: SaveMappingFn;
  removeMapping: (mappingId: string) => Promise<void>;
}

export function useJiraDataLoader({
  projectId,
  scopeId,
  projectKey,
}: JiraDataLoaderDeps): JiraDataLoaderResult {
  const {
    typeMappings,
    isLoadingMappings,
    loadMappingsByScope,
    saveMapping,
    removeMapping,
  } = useExportStore();

  useEffect(() => {
    void loadMappingsByScope(projectId, scopeId);

    const cat = status.categoryKey;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(status);
    return acc;
  }, {});

  return {
    jiraIssueTypes,
    jiraStatuses,
    isLoadingTypes,
    isLoadingStatuses,
    typeMappings,
    isLoadingMappings,
    saveMapping,
    removeMapping,
    statusesByCategory,
  };
}
