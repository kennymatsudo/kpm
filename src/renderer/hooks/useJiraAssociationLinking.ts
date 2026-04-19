import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrackerStore, useTrackerConfigStore, useTrackerMetadataStore } from '../stores';
import type { TrackerBrowsableIssue } from '../stores/tracker/useConfigStore';
import type { TrackerProjectRef } from '../stores/tracker/useMetadataStore';

export type FilterPreset = 'all' | 'epic' | 'custom';
export type IssueRelationship = 'self' | 'children';

interface UseJiraAssociationLinkingOptions {
  projectId: string | null;
  siteUrl: string;
  onLinked: () => void;
}

interface UseJiraAssociationLinkingResult {
  projects: TrackerProjectRef[];
  isLoadingProjects: boolean;
  projectError: string | null;
  loadProjects: (force?: boolean) => Promise<{ success: boolean; error?: string }>;
  selectedProject: TrackerProjectRef | null;
  filterPreset: FilterPreset;
  issueSearchQuery: string;
  issues: TrackerBrowsableIssue[];
  isLoadingIssues: boolean;
  issuesError: string | null;
  selectedIssue: TrackerBrowsableIssue | null;
  issueRelationship: IssueRelationship;
  childIssues: TrackerBrowsableIssue[];
  isLoadingChildren: boolean;
  childrenError: string | null;
  customJql: string;
  displayName: string;
  isLinking: boolean;
  error: string | null;
  currentJql: string;
  canLink: boolean;
  setIssueSearchQuery: (query: string) => void;
  setIssueRelationship: (relationship: IssueRelationship) => void;
  setCustomJql: (jql: string) => void;
  setDisplayName: (name: string) => void;
  selectProject: (project: TrackerProjectRef | null) => void;
  selectFilterPreset: (preset: FilterPreset) => void;
  selectIssue: (issue: TrackerBrowsableIssue | null) => void;
  handleLink: () => Promise<void>;
}

export function useJiraAssociationLinking({
  projectId,
  siteUrl,
  onLinked,
}: UseJiraAssociationLinkingOptions): UseJiraAssociationLinkingResult {
  const { addAssociation } = useTrackerStore();
  const loadRecentIssues = useTrackerConfigStore((state) => state.loadRecentIssues);
  const searchIssues = useTrackerConfigStore((state) => state.searchIssues);
  const loadChildIssues = useTrackerConfigStore((state) => state.loadChildIssues);
  const projects = useTrackerMetadataStore((state) => state.projects);
  const isLoadingProjects = useTrackerMetadataStore((state) => state.isLoadingProjects);
  const projectError = useTrackerMetadataStore((state) => state.projectsError);
  const loadProjects = useTrackerMetadataStore((state) => state.loadProjects);

  const [selectedProject, setSelectedProject] = useState<TrackerProjectRef | null>(null);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('all');
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [issues, setIssues] = useState<TrackerBrowsableIssue[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<TrackerBrowsableIssue | null>(null);
  const [issueRelationship, setIssueRelationship] = useState<IssueRelationship>('children');
  const [childIssues, setChildIssues] = useState<TrackerBrowsableIssue[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [customJql, setCustomJql] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issueRequestIdRef = useRef(0);
  const childRequestIdRef = useRef(0);

  const loadEpicIssues = useCallback(async () => {
    if (!selectedProject) return;
    const requestId = ++issueRequestIdRef.current;

    setIsLoadingIssues(true);
    setIssuesError(null);
    try {
      const result = await loadRecentIssues(selectedProject.key, 'Epic');
      if (requestId !== issueRequestIdRef.current) return;
      if (result.success) {
        setIssues(result.issues || []);
      } else {
        setIssuesError(result.error || 'Failed to load epics');
      }
    } catch (e) {
      if (requestId !== issueRequestIdRef.current) return;
      setIssuesError(e instanceof Error ? e.message : 'Failed to load epics');
    } finally {
      if (requestId === issueRequestIdRef.current) {
        setIsLoadingIssues(false);
      }
    }
  }, [loadRecentIssues, selectedProject]);

  const searchEpicIssues = useCallback(
    async (query: string) => {
      if (!selectedProject) return;
      const requestId = ++issueRequestIdRef.current;

      setIsLoadingIssues(true);
      setIssuesError(null);
      try {
        const result = await searchIssues(selectedProject.key, query, 'Epic');
        if (requestId !== issueRequestIdRef.current) return;
        if (result.success) {
          setIssues(result.issues || []);
        } else {
          setIssuesError(result.error || 'Failed to search epics');
        }
      } catch (e) {
        if (requestId !== issueRequestIdRef.current) return;
        setIssuesError(e instanceof Error ? e.message : 'Failed to search epics');
      } finally {
        if (requestId === issueRequestIdRef.current) {
          setIsLoadingIssues(false);
        }
      }
    },
    [searchIssues, selectedProject]
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProject || filterPreset !== 'epic') {
      issueRequestIdRef.current += 1;
      setIssues([]);
      setIssuesError(null);
      setSelectedIssue(null);
      setIsLoadingIssues(false);
      return;
    }

    if (!issueSearchQuery.trim()) {
      void loadEpicIssues();
    }
  }, [filterPreset, issueSearchQuery, loadEpicIssues, selectedProject]);

  useEffect(() => {
    if (!selectedProject || filterPreset !== 'epic' || !issueSearchQuery.trim()) {
      return;
    }

    const timeout = setTimeout(() => {
      void searchEpicIssues(issueSearchQuery);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filterPreset, issueSearchQuery, searchEpicIssues, selectedProject]);

  useEffect(() => {
    if (!selectedProject || !selectedIssue || issueRelationship !== 'children') {
      childRequestIdRef.current += 1;
      setChildIssues([]);
      setChildrenError(null);
      setIsLoadingChildren(false);
      return;
    }

    const loadChildren = async () => {
      const requestId = ++childRequestIdRef.current;
      setIsLoadingChildren(true);
      setChildrenError(null);
      try {
        const result = await loadChildIssues(selectedProject.key, selectedIssue.key);
        if (requestId !== childRequestIdRef.current) return;
        if (result.success) {
          setChildIssues(result.issues || []);
        } else {
          setChildrenError(result.error || 'Failed to load child issues');
        }
      } catch (e) {
        if (requestId !== childRequestIdRef.current) return;
        setChildrenError(e instanceof Error ? e.message : 'Failed to load child issues');
      } finally {
        if (requestId === childRequestIdRef.current) {
          setIsLoadingChildren(false);
        }
      }
    };

    void loadChildren();
  }, [issueRelationship, loadChildIssues, selectedIssue, selectedProject]);

  const selectProject = useCallback((project: TrackerProjectRef | null) => {
    issueRequestIdRef.current += 1;
    childRequestIdRef.current += 1;
    setSelectedProject(project);
    setSelectedIssue(null);
    setIssueSearchQuery('');
    setIssues([]);
    setIssuesError(null);
    setIsLoadingIssues(false);
    setIssueRelationship('children');
    setChildIssues([]);
    setChildrenError(null);
    setIsLoadingChildren(false);
    setCustomJql(project ? `project = ${project.key}` : '');
  }, []);

  const selectFilterPreset = useCallback(
    (preset: FilterPreset) => {
      issueRequestIdRef.current += 1;
      childRequestIdRef.current += 1;
      setFilterPreset(preset);
      setSelectedIssue(null);
      setIssueSearchQuery('');
      setIssues([]);
      setIssuesError(null);
      setIsLoadingIssues(false);
      setIssueRelationship('children');
      setChildIssues([]);
      setChildrenError(null);
      setIsLoadingChildren(false);

      if (!selectedProject) {
        setCustomJql('');
        return;
      }

      if (preset === 'all') {
        setCustomJql(`project = ${selectedProject.key}`);
      } else if (preset === 'custom') {
        setCustomJql(`project = ${selectedProject.key} AND `);
      }
    },
    [selectedProject]
  );

  let currentJql = '';
  if (selectedProject) {
    switch (filterPreset) {
      case 'all':
        currentJql = `project = ${selectedProject.key}`;
        break;
      case 'epic':
        if (selectedIssue) {
          currentJql = issueRelationship === 'self'
            ? `key = ${selectedIssue.key}`
            : `parent = ${selectedIssue.key}`;
        }
        break;
      case 'custom':
        currentJql = customJql.trim();
        break;
    }
  }

  const handleLink = useCallback(async () => {
    if (!selectedProject || !projectId || !currentJql) return;

    setIsLinking(true);
    setError(null);

    try {
      const result = await addAssociation(
        'jira',
        projectId,
        siteUrl,
        selectedProject.key,
        selectedProject.name,
        currentJql,
        displayName.trim() || undefined
      );
      if (result.success) {
        onLinked();
      } else {
        setError(result.error || 'Failed to link project');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link project');
    } finally {
      setIsLinking(false);
    }
  }, [addAssociation, currentJql, displayName, onLinked, projectId, selectedProject, siteUrl]);

  return {
    projects,
    isLoadingProjects,
    projectError,
    loadProjects,
    selectedProject,
    filterPreset,
    issueSearchQuery,
    issues,
    isLoadingIssues,
    issuesError,
    selectedIssue,
    issueRelationship,
    childIssues,
    isLoadingChildren,
    childrenError,
    customJql,
    displayName,
    isLinking,
    error,
    currentJql,
    canLink: currentJql.length > 0,
    setIssueSearchQuery,
    setIssueRelationship,
    setCustomJql,
    setDisplayName,
    selectProject,
    selectFilterPreset,
    selectIssue: setSelectedIssue,
    handleLink,
  };
}
