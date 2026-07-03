import { useEffect, useMemo, useState, useCallback } from 'react';
import { LoadingSpinner } from '../../ui/LoadingButton';
import {
  listLinearTrackerProjects,
  listLinearTrackerTeams,
  listTrackerProjectStatuses,
} from '../../../services/trackerService';
import { useTrackerStore } from '../../../stores';
import { SearchableSelect } from './SearchableSelect';

interface Props {
  projectId: string | null;
  onLinked: () => void;
  onCancel: () => void;
}

interface LinearTeam {
  key: string;
  name: string;
}

interface LinearProject {
  id: string;
  name: string;
}

interface LinearState {
  id: string;
  name: string;
  categoryKey: string;
}

/**
 * Linear linking form. Team selection is required; project and state scoping
 * are optional. Selecting a Linear Project narrows the import to just that
 * project's issues; selecting workflow states narrows by state. With neither
 * set, every issue in the team syncs.
 */
export function LinearLinkProjectForm({ projectId, onLinked, onCancel }: Props) {
  const addAssociation = useTrackerStore((state) => state.addAssociation);

  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTeamKey, setSelectedTeamKey] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Project-filter data — lazy-loaded when a team is selected
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // State-filter data — lazy-loaded when a team is selected
  const [states, setStates] = useState<LinearState[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [selectedStateIds, setSelectedStateIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setIsLoadingTeams(true);
    setLoadError(null);
    listLinearTrackerTeams()
      .then((result: { success: boolean; teams?: LinearTeam[]; error?: string }) => {
        if (cancelled) return;
        if (!result.success || !result.teams) {
          setLoadError(result.error || 'Failed to load Linear teams');
          return;
        }
        setTeams(result.teams);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Failed to load Linear teams');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTeams(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Linear projects (within the team) when the team selection changes.
  useEffect(() => {
    if (!selectedTeamKey) {
      setProjects([]);
      setSelectedProjectId('');
      setProjectsError(null);
      return;
    }

    let cancelled = false;
    setProjects([]);
    setIsLoadingProjects(true);
    setProjectsError(null);
    setSelectedProjectId('');
    listLinearTrackerProjects({ teamKey: selectedTeamKey })
      .then((result: { success: boolean; projects?: LinearProject[]; error?: string }) => {
        if (cancelled) return;
        if (!result.success || !result.projects) {
          setProjectsError(result.error || 'Failed to load Linear projects');
          setProjects([]);
          return;
        }
        setProjects(result.projects);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setProjectsError(e instanceof Error ? e.message : 'Failed to load Linear projects');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamKey]);

  // Load workflow states when the team selection changes.
  useEffect(() => {
    if (!selectedTeamKey) {
      setStates([]);
      setSelectedStateIds(new Set());
      setStatesError(null);
      return;
    }

    let cancelled = false;
    setStates([]);
    setSelectedStateIds(new Set());
    setIsLoadingStates(true);
    setStatesError(null);
    listTrackerProjectStatuses({ projectKey: selectedTeamKey, trackerType: 'linear' })
      .then((result: { success: boolean; statuses?: LinearState[]; error?: string }) => {
        if (cancelled) return;
        if (!result.success || !result.statuses) {
          setStatesError(result.error || 'Failed to load workflow states');
          setStates([]);
          return;
        }
        setStates(result.statuses);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatesError(e instanceof Error ? e.message : 'Failed to load workflow states');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamKey]);

  const toggleState = (stateId: string) => {
    setSelectedStateIds((prev) => {
      const next = new Set(prev);
      if (next.has(stateId)) {
        next.delete(stateId);
      } else {
        next.add(stateId);
      }
      return next;
    });
  };

  const selectedTeam = teams.find((t) => t.key === selectedTeamKey) ?? null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const handleLink = useCallback(async () => {
    if (!projectId || !selectedTeam) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      const filter = {
        teamKey: selectedTeam.key,
        ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        ...(selectedStateIds.size > 0 ? { stateIds: Array.from(selectedStateIds) } : {}),
      };
      // Default name reflects the scoping the user actually chose: just the team
      // when team-wide, or "Team - Project" when narrowed to a Linear Project.
      const fallbackName = selectedProject
        ? `${selectedTeam.name} - ${selectedProject.name}`
        : undefined;
      const result = await addAssociation(
        'linear',
        projectId,
        'linear.app',
        selectedTeam.key,
        selectedTeam.name,
        JSON.stringify(filter),
        displayName.trim() || fallbackName
      );
      if (result.success) {
        onLinked();
      } else {
        setLinkError(result.error || 'Failed to link team');
      }
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Failed to link team');
    } finally {
      setIsLinking(false);
    }
  }, [
    addAssociation,
    displayName,
    onLinked,
    projectId,
    selectedProject,
    selectedProjectId,
    selectedStateIds,
    selectedTeam,
  ]);

  // Group states by category for the picker UI.
  const statesByCategory = useMemo(() => {
    const groups: Record<string, LinearState[]> = {};
    for (const state of states) {
      const category = state.categoryKey || 'other';
      groups[category] ??= [];
      groups[category].push(state);
    }
    return groups;
  }, [states]);

  if (isLoadingTeams) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner className="w-6 h-6 text-accent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 rounded-xl bg-danger-muted/50 border border-danger/20 text-sm text-danger">
        {loadError}
      </div>
    );
  }

  const categoryLabels: Record<string, string> = {
    new: 'Backlog / Unstarted',
    indeterminate: 'In Progress',
    done: 'Done / Canceled',
    undefined: 'Other',
    other: 'Other',
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Linear Team
        </label>
        <SearchableSelect<LinearTeam>
          options={teams}
          value={selectedTeam}
          onChange={(team) => setSelectedTeamKey(team?.key ?? '')}
          getKey={(t) => t.key}
          getLabel={(t) => t.name}
          getMeta={(t) => t.key}
          getSearchText={(t) => `${t.name} ${t.key}`}
          placeholder={`Search ${teams.length} team${teams.length === 1 ? '' : 's'}…`}
          emptyMessage="No teams match your search"
          disabled={isLinking}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Display Name (optional)
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={
            selectedProject
              ? `${selectedTeam?.name ?? ''} - ${selectedProject.name}`
              : selectedTeam?.name ?? ''
          }
          className="input"
          disabled={isLinking}
        />
      </div>

      {/* Project picker — appears once a team is chosen */}
      {selectedTeamKey && (
        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Linear Project (optional)
          </label>
          {isLoadingProjects ? (
            <div className="flex items-center gap-2 text-xs text-text-tertiary py-2">
              <LoadingSpinner className="w-3.5 h-3.5" />
              Loading Linear projects…
            </div>
          ) : projectsError ? (
            <p className="text-xs text-danger">{projectsError}</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-text-tertiary">No Linear projects found for this team.</p>
          ) : (
            <SearchableSelect<LinearProject>
              options={projects}
              value={selectedProject}
              onChange={(project) => setSelectedProjectId(project?.id ?? '')}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              placeholder={`Search ${projects.length} project${projects.length === 1 ? '' : 's'}…`}
              emptyMessage="No projects match your search"
              disabled={isLinking}
              allowClear
            />
          )}
          <p className="text-xs text-text-tertiary mt-1.5">
            {selectedProjectId
              ? 'Only issues in this Linear project will sync; new issues you export will land in this project.'
              : 'All projects in the team will sync.'}
          </p>
        </div>
      )}

      {/* State picker — appears once a team is chosen */}
      {selectedTeamKey && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Workflow States (optional)
            </label>
            {selectedStateIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStateIds(new Set())}
                className="text-xs text-text-tertiary hover:text-accent transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          {isLoadingStates ? (
            <div className="flex items-center gap-2 text-xs text-text-tertiary py-2">
              <LoadingSpinner className="w-3.5 h-3.5" />
              Loading workflow states…
            </div>
          ) : statesError ? (
            <p className="text-xs text-danger">{statesError}</p>
          ) : states.length === 0 ? (
            <p className="text-xs text-text-tertiary">No workflow states found for this team.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto p-2 rounded-lg bg-surface-2 border border-border-subtle">
              {Object.entries(statesByCategory).map(([category, groupStates]) => (
                <div key={category}>
                  <p className="text-xxs font-medium uppercase tracking-wider text-text-muted mb-1">
                    {categoryLabels[category] ?? category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {groupStates.map((state) => {
                      const checked = selectedStateIds.has(state.id);
                      return (
                        <button
                          key={state.id}
                          type="button"
                          onClick={() => toggleState(state.id)}
                          className={`text-xs px-2 py-1 rounded-full transition-colors cursor-pointer ${
                            checked
                              ? 'bg-accent text-white'
                              : 'bg-surface-3 text-text-secondary hover:bg-surface-3/80'
                          }`}
                        >
                          {state.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-text-tertiary mt-1.5">
            {selectedStateIds.size === 0
              ? 'All states will sync.'
              : `${selectedStateIds.size} state${selectedStateIds.size === 1 ? '' : 's'} selected — only issues in these states will sync.`}
          </p>
        </div>
      )}

      {linkError && (
        <div className="p-3 rounded-xl bg-danger-muted/50 border border-danger/20 text-sm text-danger">
          {linkError}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={onCancel} disabled={isLinking} className="btn btn-secondary">
          Cancel
        </button>
        <div className="flex-1" />
        <button
          onClick={handleLink}
          disabled={isLinking || !selectedTeam}
          className="btn btn-primary"
        >
          {isLinking ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Linking…
            </>
          ) : (
            'Link Team'
          )}
        </button>
      </div>
    </div>
  );
}
