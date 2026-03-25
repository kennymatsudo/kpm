import { useEffect } from 'react';
import { useExportStore } from '../../../../stores';
import {
  useTrackerMetadataStore,
  type TrackerIssueTypeOption,
  type TrackerStatusOption,
} from '../../../../stores/tracker/useMetadataStore';

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
  jiraIssueTypes: TrackerIssueTypeOption[];
  jiraStatuses: TrackerStatusOption[];
  isLoadingTypes: boolean;
  isLoadingStatuses: boolean;
  typesError: string | null;
  statusesError: string | null;
  typeMappings: TrackerTypeMapping[];
  isLoadingMappings: boolean;
  saveMapping: SaveMappingFn;
  removeMapping: (mappingId: string) => Promise<void>;
  statusesByCategory: Record<string, TrackerStatusOption[]>;
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
  );
  const isLoadingTypes = isLoadingTypesForProject && jiraIssueTypes.length === 0;
  const isLoadingStatuses = isLoadingStatusesForProject && jiraStatuses.length === 0;

  useEffect(() => {
    void loadMappingsByScope(projectId, scopeId);

  const statusesByCategory = jiraStatuses.reduce<Record<string, TrackerStatusOption[]>>((acc, status) => {
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
    typesError,
    statusesError,
    typeMappings,
    isLoadingMappings,
    saveMapping,
    removeMapping,
    statusesByCategory,
  };
}
