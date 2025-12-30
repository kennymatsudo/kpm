import type { PlanItem, DeletedItemAction } from '../../../../shared/types';

interface Props {
  items: PlanItem[];
  action: DeletedItemAction;
  decisions: Record<string, 'keep' | 'delete'>;
  onActionChange: (action: DeletedItemAction) => void;
  onDecisionChange: (itemId: string, decision: 'keep' | 'delete') => void;
}

  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="font-medium text-sm mb-2 flex items-center gap-2 text-text-primary">
        <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </h3>

      <p className="text-text-muted text-xs mb-3">
      </p>

      {/* Bulk action selector */}
      <div className="mb-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            className="w-3.5 h-3.5 text-accent focus:ring-accent"
            checked={action === 'keep_local'}
            onChange={() => onActionChange('keep_local')}
          />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            className="w-3.5 h-3.5 text-accent focus:ring-accent"
            checked={action === 'delete'}
            onChange={() => onActionChange('delete')}
          />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            className="w-3.5 h-3.5 text-accent focus:ring-accent"
            checked={action === 'decide_each'}
            onChange={() => onActionChange('decide_each')}
          />
          <span className="text-sm text-text-primary">Decide for each item</span>
        </label>
      </div>

      {/* Individual decisions */}
      {action === 'decide_each' && (
        <div className="space-y-2 pl-4 border-l-2 border-border-subtle">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-surface-2 rounded-lg">
              <div className="flex-1 min-w-0">
                <span className="text-xs px-1.5 py-0.5 bg-surface-3 rounded text-text-muted font-mono mr-2">
                  {item.external_key}
                </span>
                <span className="text-sm text-text-primary truncate">{item.title}</span>
                {item.parent_id && (
                  <span className="text-xs text-text-muted ml-2">
                    (in {item.status === 'planned' ? 'canvas' : 'backlog'})
                  </span>
                )}
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <button
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    decisions[item.id] === 'keep'
                      ? 'bg-success text-white'
                      : 'bg-surface-3 text-text-primary hover:bg-surface-3/80'
                  }`}
                  onClick={() => onDecisionChange(item.id, 'keep')}
                >
                  Keep
                </button>
                <button
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    decisions[item.id] === 'delete'
                      ? 'bg-danger text-white'
                      : 'bg-surface-3 text-text-primary hover:bg-surface-3/80'
                  }`}
                  onClick={() => onDecisionChange(item.id, 'delete')}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
