import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useExportStore } from '../../../../stores';
import {
  useTrackerMetadataStore,
  type TrackerIssueTypeOption,
  type TrackerStatusOption,
} from '../../../../stores/tracker/useMetadataStore';
import type { TrackerTypeMapping, TrackerType } from '../../../../../shared/types';

interface JiraDataLoaderDeps {
  projectId: string;
  scopeId: string;
  projectKey: string;
  trackerType?: TrackerType;
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

const EMPTY_ISSUE_TYPES: TrackerIssueTypeOption[] = [];
const EMPTY_STATUSES: TrackerStatusOption[] = [];

export function useJiraDataLoader({
  projectId,
  scopeId,
  projectKey,
  trackerType = 'jira',
}: JiraDataLoaderDeps): JiraDataLoaderResult {
  const {
    typeMappings,
    isLoadingMappings,
    loadMappingsByScope,
    saveMapping,
    removeMapping,
  } = useExportStore();
  const statusCacheKey = projectKey ? `${trackerType}:${projectKey}` : '';
  const {
    jiraIssueTypes,
    jiraStatuses,
    isLoadingTypesForProject,
    isLoadingStatusesForProject,
    typesError,
    statusesError,
    loadIssueTypes,
    loadStatuses,
  } = useTrackerMetadataStore(
    useShallow((state) => ({
      jiraIssueTypes: projectKey
        ? state.issueTypesByProject[projectKey] ?? EMPTY_ISSUE_TYPES
        : EMPTY_ISSUE_TYPES,
      jiraStatuses: statusCacheKey ? state.statusesByProject[statusCacheKey] ?? EMPTY_STATUSES : EMPTY_STATUSES,
      isLoadingTypesForProject: Boolean(projectKey) && state.loadingIssueTypesFor.has(projectKey),
      isLoadingStatusesForProject: Boolean(statusCacheKey) && state.loadingStatusesFor.has(statusCacheKey),
      typesError: projectKey ? state.issueTypesErrorByProject[projectKey] || null : null,
      statusesError: statusCacheKey ? state.statusesErrorByProject[statusCacheKey] || null : null,
      loadIssueTypes: state.loadIssueTypes,
      loadStatuses: state.loadStatuses,
    }))
  );
  const isLoadingTypes = isLoadingTypesForProject && jiraIssueTypes.length === 0;
  const isLoadingStatuses = isLoadingStatusesForProject && jiraStatuses.length === 0;

  useEffect(() => {
    void loadMappingsByScope(projectId, scopeId);
    if (projectKey) {
      // Linear has no `issueTypes` concept, so don't fetch them.
      if (trackerType === 'jira') {
        void loadIssueTypes(projectKey);
      }
      void loadStatuses(projectKey, trackerType);
    }
  }, [projectId, scopeId, projectKey, trackerType, loadIssueTypes, loadMappingsByScope, loadStatuses]);

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
