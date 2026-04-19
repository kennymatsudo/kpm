import { LoadingSpinner } from '../../ui/LoadingButton';
import {
  listLinearTrackerTeams,
  listTrackerProjectStatuses,
} from '../../../services/trackerService';
import { useTrackerStore } from '../../../stores';

interface Props {
  projectId: string | null;
  onLinked: () => void;
  onCancel: () => void;
}

interface LinearTeam {
  key: string;
  name: string;
}

interface LinearState {
  id: string;
  name: string;
  categoryKey: string;
}

/**
 */
export function LinearLinkProjectForm({ projectId, onLinked, onCancel }: Props) {
  const addAssociation = useTrackerStore((state) => state.addAssociation);

  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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

  // Load workflow states when the team selection changes.
  useEffect(() => {
      setStates([]);
      setSelectedStateIds(new Set());
      setStatesError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingStates(true);
    setStatesError(null);
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


  const handleLink = useCallback(async () => {
    if (!projectId || !selectedTeam) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      const filter = {
        teamKey: selectedTeam.key,
        ...(selectedStateIds.size > 0 ? { stateIds: Array.from(selectedStateIds) } : {}),
      };
      const result = await addAssociation(
        'linear',
        projectId,
        'linear.app',
        selectedTeam.key,
        selectedTeam.name,
        JSON.stringify(filter),
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
          disabled={isLinking}
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Display Name (optional)
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="input"
          disabled={isLinking}
        />
      </div>

      {/* State picker — appears once a team is chosen */}
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
