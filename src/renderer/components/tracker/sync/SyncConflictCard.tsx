
interface Props {
  conflict: SyncConflict;
  resolution: ConflictResolution | undefined;
  onResolve: (resolution: ConflictResolution) => void;
  /** Index for aria-label */
  index?: number;
  /** Total conflicts for aria-label */
  total?: number;
}

  const keepMineRef = useRef<HTMLButtonElement>(null);
  const useTheirsRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        onResolve('keep_mine');
        keepMineRef.current?.focus();
        break;
      case 'ArrowRight':
        e.preventDefault();
        onResolve('use_theirs');
        useTheirsRef.current?.focus();
        break;
      case '1':
        e.preventDefault();
        onResolve('keep_mine');
        break;
      case '2':
        e.preventDefault();
        onResolve('use_theirs');
        break;
    }
  }, [onResolve]);

  const ariaLabel = index !== undefined && total !== undefined
    ? `Conflict ${index + 1} of ${total}: ${conflict.external_key} - ${conflict.title}`
    : `Conflict: ${conflict.external_key} - ${conflict.title}`;

  return (
    <div
      className={`rounded-xl overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-accent/50 ${!resolution ? 'ring-2 ring-warning/50' : ''}`}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-surface-2 flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 bg-surface-3 rounded text-text-muted font-mono">
          {conflict.external_key}
        </span>
          {conflict.title}
        </span>
      </div>

              </div>
          </div>
        </div>

      {/* Resolution buttons */}
      <div className="px-3 py-2 bg-surface-2 flex gap-2">
        <button
          ref={keepMineRef}
            resolution === 'keep_mine'
              ? 'bg-success text-white'
              : 'bg-surface-3 text-text-primary hover:bg-surface-3/80'
          }`}
          onClick={() => onResolve('keep_mine')}
          aria-pressed={resolution === 'keep_mine'}
        >
          Keep Mine
        </button>
        <button
          ref={useTheirsRef}
            resolution === 'use_theirs'
              ? 'bg-info text-white'
              : 'bg-surface-3 text-text-primary hover:bg-surface-3/80'
          }`}
          onClick={() => onResolve('use_theirs')}
          aria-pressed={resolution === 'use_theirs'}
        >
        </button>
      </div>
    </div>
  );
}
