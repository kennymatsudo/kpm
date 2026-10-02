import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useExportStore } from '../../../../stores';
import {
  trackerMetadataKey,
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
  // Statuses and issue types share one key per tracker + project.
  const metadataKey = projectKey ? trackerMetadataKey(trackerType, projectKey) : '';
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
      jiraIssueTypes: metadataKey ? state.issueTypesByProject[metadataKey] ?? EMPTY_ISSUE_TYPES : EMPTY_ISSUE_TYPES,
      jiraStatuses: metadataKey ? state.statusesByProject[metadataKey] ?? EMPTY_STATUSES : EMPTY_STATUSES,
      isLoadingTypesForProject: Boolean(metadataKey) && state.loadingIssueTypesFor.has(metadataKey),
      isLoadingStatusesForProject: Boolean(metadataKey) && state.loadingStatusesFor.has(metadataKey),
      typesError: metadataKey ? state.issueTypesErrorByProject[metadataKey] || null : null,
      statusesError: metadataKey ? state.statusesErrorByProject[metadataKey] || null : null,
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
        void loadIssueTypes(projectKey, trackerType);
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
