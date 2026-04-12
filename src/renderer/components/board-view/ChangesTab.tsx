/**
 * ChangesTab - Aggregated git diff view for an agent session.
 *
 * Shows all files changed by the agent with +/- stats.
 * Uses the existing diff infrastructure from devSessionsStore.
 */

import { getAgentCommitLog, getAgentCommitFiles } from '../../services/agentSessionService';

interface ChangesTabProps {
  sessionId: string;
  commitState?: BackgroundCommitState;
  refreshToken?: number;
}

interface CommitEntry {
  sha: string;
  subject: string;
  authorName: string;
  date: string;
}

interface FileStat {
  path: string;
  additions: number;
  deletions: number;
  content: string;
}

/** Parse a unified diff into per-file stats and content */
function parseDiffStats(diff: string): FileStat[] {
  const files: FileStat[] = [];
  const lines = diff.split('\n');
  let currentFile: FileStat | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        currentFile.content = currentLines.join('\n');
      }
      const match = /diff --git a\/.+ b\/(.+)/.exec(line);
      if (match) {
        currentFile = { path: match[1], additions: 0, deletions: 0, content: '' };
        currentLines = [line];
        files.push(currentFile);
      }
    } else if (currentFile) {
      currentLines.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletions++;
      }
    }
  }

  if (currentFile) {
    currentFile.content = currentLines.join('\n');
  }

  return files;
}

const FileEntry = memo(function FileEntry({ file }: { file: FileStat }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-text-muted transition-transform duration-150 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <span className="text-xs text-text-secondary truncate flex-1 min-w-0 font-mono">
          {file.path}
        </span>

        <span className="flex items-center gap-1.5 shrink-0">
          {file.additions > 0 && (
            <span className="text-tiny text-emerald-400 tabular-nums">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-tiny text-red-400 tabular-nums">-{file.deletions}</span>
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="overflow-x-auto border-t border-border-subtle bg-surface-1">
          <pre className="text-tiny font-mono leading-relaxed">
            {file.content.split('\n').map((line, i) => {
              const isAdd = line.startsWith('+') && !line.startsWith('+++');
              const isDel = line.startsWith('-') && !line.startsWith('---');
              const isHunk = line.startsWith('@@');
              return (
                <div
                  key={i}
                  className={
                    isAdd ? 'bg-emerald-500/10 text-emerald-300' :
                    isDel ? 'bg-red-500/10 text-red-300' :
                    isHunk ? 'text-accent/70' :
                    'text-text-muted'
                  }
                >
                  <span className="select-none px-2 opacity-40 inline-block w-4">{
                    isAdd ? '+' : isDel ? '-' : ' '
                  }</span>
                  <span className="px-1">{line.slice(1)}</span>
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
});

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface CommitFileEntry {
  path: string;
  additions: number;
  deletions: number;
}

const ExpandableCommitEntry = memo(function ExpandableCommitEntry({
  commit,
  sessionId,
}: {
  commit: CommitEntry;
  sessionId: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [files, setFiles] = useState<CommitFileEntry[] | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const handleToggle = useCallback(async () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && files === null && !isLoadingFiles) {
      setIsLoadingFiles(true);
      try {
        const result = await getAgentCommitFiles(sessionId, commit.sha);
        if (result.success && result.files) {
          setFiles(result.files);
        } else {
          setFiles([]);
        }
      } finally {
        setIsLoadingFiles(false);
      }
    }
  }, [isExpanded, files, isLoadingFiles, sessionId, commit.sha]);

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => void handleToggle()}
        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-surface-2 transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-text-muted transition-transform duration-150 shrink-0 mt-0.5 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-tiny text-text-muted shrink-0 pt-0.5 select-all">
          {commit.sha}
        </span>
        <span className="text-xs text-text-secondary truncate flex-1 min-w-0">
          {commit.subject}
        </span>
        <span className="text-tiny text-text-tertiary shrink-0 pt-0.5">
          {formatRelativeDate(commit.date)}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-border-subtle bg-surface-1">
          {isLoadingFiles ? (
            <div className="px-6 py-2 text-tiny text-text-muted">Loading files...</div>
          ) : files && files.length > 0 ? (
            files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-6 py-1.5"
              >
                <span className="text-xs text-text-secondary truncate flex-1 min-w-0 font-mono">
                  {file.path}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {file.additions > 0 && (
                    <span className="text-tiny text-emerald-400 tabular-nums">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-tiny text-red-400 tabular-nums">-{file.deletions}</span>
                  )}
                </span>
              </div>
            ))
          ) : (
            <div className="px-6 py-2 text-tiny text-text-muted">No file changes</div>
          )}
        </div>
      )}
    </div>
  );
});

const CommitList = memo(function CommitList({
  commits,
  isLoading,
  sessionId,
}: {
  commits: CommitEntry[];
  isLoading: boolean;
  sessionId: string;
}) {
  return (
    <div className="border-t border-border-subtle">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-1">
        <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" strokeWidth={2} />
          <path strokeLinecap="round" strokeWidth={2} d="M12 3v6m0 6v6M3 12h6m6 0h6" />
        </svg>
        <span className="text-xs text-text-secondary">
          {isLoading ? 'Commits' : `${commits.length} commit${commits.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      {isLoading ? (
        <div className="px-3 py-3 text-tiny text-text-muted">Loading...</div>
      ) : (
        commits.map((commit) => (
          <ExpandableCommitEntry key={commit.sha} commit={commit} sessionId={sessionId} />
        ))
      )}
    </div>
  );
});

export const ChangesTab = memo(function ChangesTab({
  sessionId,
  commitState,
  refreshToken = 0,
}: ChangesTabProps) {
  const diff = useDevSessionsStore((s) => s.diffBySessionId.get(sessionId));
  const diffError = useDevSessionsStore((s) => s.diffErrorBySessionId.get(sessionId));
  const isLoading = useDevSessionsStore((s) => s.diffLoadingIds.has(sessionId));
  const loadDiff = useDevSessionsStore((s) => s.loadDiff);
  const agentState = useDevSessionsStore((s) => s.agentStateBySessionId.get(sessionId));

  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);

  const isAgentActive =
    agentState === 'starting' || agentState === 'working' || agentState === 'waiting_for_input';
  const isCommitting = commitState?.status === 'running';
  const commitError = commitState?.status === 'failed' ? commitState.error : null;

  const loadCommits = useCallback(async () => {
    setIsLoadingCommits(true);
    try {
      const result = await getAgentCommitLog(sessionId);
      if (result.success && result.commits) {
        setCommits(result.commits);
      }
    } finally {
      setIsLoadingCommits(false);
    }
  }, [sessionId]);

  const handleRefresh = useCallback(() => {
    void loadDiff(sessionId, { force: true });
    void loadCommits();
  }, [sessionId, loadDiff, loadCommits]);

  useEffect(() => {
    if (diff === undefined && !isLoading) {
      void loadDiff(sessionId);
    }
  }, [diff, isLoading, sessionId, loadDiff]);

  useEffect(() => {
  }, [loadCommits]);

  useEffect(() => {
    if (!isAgentActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadDiff(sessionId, { force: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAgentActive, sessionId, loadDiff]);

  useEffect(() => {
    if (!agentState || isAgentActive) {
      return;
    }

    void loadDiff(sessionId, { force: true });
    void loadCommits();
  }, [agentState, isAgentActive, sessionId, loadDiff, loadCommits]);

  useEffect(() => {
    if (refreshToken === 0) {
      return;
    }

    void loadDiff(sessionId, { force: true });
    void loadCommits();
  }, [refreshToken, sessionId, loadDiff, loadCommits]);

  const hasFiles = files.length > 0;
  const hasCommits = commits.length > 0;

  const refreshButton = (
    <button
      onClick={handleRefresh}
      className="p-1 hover:bg-surface-3 rounded transition-colors"
      title="Refresh"
    >
      <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-text-muted text-xs">
        Loading diff...
      </div>
    );
  }

  if (!hasFiles) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Empty state / error */}
        <div className="flex flex-col justify-center gap-2 px-4 py-6 text-center">
          {diffError ? (
            <>
              <span className="text-xs text-red-400">Failed to load diff</span>
              <span className="text-tiny text-text-tertiary font-mono break-all">{diffError}</span>
            </>
          ) : commitError ? (
          ) : (
            <span className="text-text-muted text-xs">
            </span>
          )}
          <button
            onClick={handleRefresh}
            className="text-tiny text-accent hover:text-accent/80 transition-colors"
          >
            Refresh now
          </button>
        </div>

        {/* Commits ahead of base branch */}
        {(hasCommits || isLoadingCommits) && (
          <CommitList commits={commits} isLoading={isLoadingCommits} sessionId={sessionId} />
        )}
      </div>
    );
  }

  return (
        </div>


    </div>
  );
});
