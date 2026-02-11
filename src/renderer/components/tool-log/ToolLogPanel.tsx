import { useShallow } from 'zustand/react/shallow';
import { useToolLogStore } from '../../stores/toolLogStore';
import type { ToolCallLogEntry, ToolCallTurnSummary, ActivityType } from '../../../shared/types';

const CATEGORY_LABELS: Record<ActivityType, string> = {
  search: 'Search',
  read: 'Read',
  glob: 'Glob',
  command: 'Command',
  edit: 'Edit',
  thinking: 'Thinking',
  other: 'Other',
};

function CategoryIcon({ type }: { type: ActivityType }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0';
  switch (type) {
    case 'read':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      );
    case 'search':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'glob':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case 'edit':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case 'command':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'thinking':
    case 'other':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
  }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
}

function truncatePath(p: string, maxLen = 50): string {
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  if (parts.length <= 2) return '...' + p.slice(-maxLen + 3);
  return '.../' + parts.slice(-2).join('/');
}

/** Group entries by turn index */
function groupByTurn(entries: ToolCallLogEntry[]): Map<number, ToolCallLogEntry[]> {
  const grouped = new Map<number, ToolCallLogEntry[]>();
  for (const e of entries) {
    const existing = grouped.get(e.turnIndex);
    if (existing) {
      existing.push(e);
    } else {
      grouped.set(e.turnIndex, [e]);
    }
  }
  return grouped;
}

interface TurnGroupProps {
  turnIndex: number;
  entries: ToolCallLogEntry[];
  summary: ToolCallTurnSummary | undefined;
  duplicateFiles: Set<string>;
}

function TurnGroup({ turnIndex, entries, summary, duplicateFiles }: TurnGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const timeRange = entries.length > 0
    ? `${formatTimestamp(entries[0].timestamp)}${entries.length > 1 ? ' - ' + formatTimestamp(entries[entries.length - 1].timestamp) : ''}`
    : '';

  return (
    <div className="border-b border-border-subtle/30 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-2/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 flex-shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        <span className="font-medium text-text-secondary">Turn {turnIndex}</span>
        <span className="text-text-tertiary">{entries.length} call{entries.length !== 1 ? 's' : ''}</span>
        {summary && summary.duplicateReads.length > 0 && (
            {summary.duplicateReads.length} duplicate{summary.duplicateReads.length !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto text-text-quaternary">{timeRange}</span>
      </button>
      {expanded && (
        <div className="divide-y divide-border-subtle/20">
          {entries.map((entry) => {
            const isDuplicate = entry.filePaths.some((p) => duplicateFiles.has(p));
            return (
                key={entry.id}
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ToolLogPanel() {
  const { entries, summaries, isEnabled, filterCategory } = useToolLogStore(
    useShallow((state) => ({
      entries: state.entries,
      summaries: state.summaries,
      isEnabled: state.isEnabled,
      filterCategory: state.filterCategory,
    }))
  );

  const togglePanel = useCallback(() => useToolLogStore.getState().togglePanel(), []);
  const setEnabled = useCallback((v: boolean) => useToolLogStore.getState().setEnabled(v), []);
  const setFilterCategory = useCallback((c: ActivityType | null) => useToolLogStore.getState().setFilterCategory(c), []);
  const clearSession = useCallback(() => useToolLogStore.getState().clearSession(), []);

  const listRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(() => {
    const saved = localStorage.getItem('kpm-toollog-height');
    return saved ? parseInt(saved, 10) : 300;
  });
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Persist height
  useEffect(() => {
    localStorage.setItem('kpm-toollog-height', panelHeight.toString());
  }, [panelHeight]);

  // Resize handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - ev.clientY;
      const newHeight = Math.max(150, Math.min(600, startHeight.current + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [panelHeight]);

  useEffect(() => {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!filterCategory) return entries;
    return entries.filter((e) => e.toolCategory === filterCategory);
  }, [entries, filterCategory]);

  // Group by turn
  const turnGroups = useMemo(() => groupByTurn(filteredEntries), [filteredEntries]);

  // Build duplicate file set across all entries
  const duplicateFiles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const p of e.filePaths) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    const dupes = new Set<string>();
    for (const [path, count] of counts) {
      if (count > 1) dupes.add(path);
    }
    return dupes;
  }, [entries]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const uniquePaths = new Set(entries.flatMap((e) => e.filePaths));
    return {
      total: entries.length,
      uniqueFiles: uniquePaths.size,
      duplicateCount: duplicateFiles.size,
    };
  }, [entries, duplicateFiles]);

  // Get summary for a given turn
  const summaryByTurn = useMemo(() => {
    const map = new Map<number, ToolCallTurnSummary>();
    for (const s of summaries) {
      map.set(s.turnIndex, s);
    }
    return map;
  }, [summaries]);

  const categories: ActivityType[] = ['read', 'search', 'glob', 'edit', 'command', 'other'];

  return (
    <div
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
      >
        <div className="absolute -top-1 -bottom-1 left-0 right-0" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle flex-shrink-0">
        <span className="text-xs font-semibold text-text-secondary tracking-wide">Tool Log</span>
          {summaryStats.total}
        </span>

        {/* Category filter */}
        >

        <div className="flex-1" />

        {/* Summary badges */}
          {summaryStats.uniqueFiles} file{summaryStats.uniqueFiles !== 1 ? 's' : ''}
        </span>
        {summaryStats.duplicateCount > 0 && (
            {summaryStats.duplicateCount} duplicate{summaryStats.duplicateCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Enable/disable toggle */}

        {/* Clear button */}

        {/* Close button */}
      </div>

      {/* Timeline */}
        {filteredEntries.length === 0 ? (
          </div>
        ) : (
          [...turnGroups.entries()].map(([turn, turnEntries]) => (
            <TurnGroup
              key={turn}
              turnIndex={turn}
              entries={turnEntries}
              summary={summaryByTurn.get(turn)}
              duplicateFiles={duplicateFiles}
            />
          ))
        )}
      </div>
    </div>
  );
}
