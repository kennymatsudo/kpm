/**
 * SimpleFieldDetail - Detail view for simple field change actions.
 * Handles: set_label, set_release, set_position, reorder, queue_for_tracker
 */

import type { PlanAction, PlanItem } from '../../../../shared/types';

interface SetLabelDetailProps {
  action: Extract<PlanAction, { type: 'set_label' }>;
  planItems: PlanItem[];
}

export function SetLabelDetail({ action, planItems }: SetLabelDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);

  if (!item) {
    return <MissingItemMessage />;
  }

  return (
    <div className="space-y-4">
      <HeaderBadge type="Label" color="bg-info/12 text-info" itemTitle={item.title} />

      <FieldChange
        fieldName="Label"
        oldValue={item.label}
        newValue={action.label}
        renderValue={(value) => value ? (
          <span className="text-tiny font-medium px-2 py-1 rounded bg-accent/10 text-accent">{value}</span>
        ) : (
          <span className="text-xs text-text-tertiary italic">none</span>
        )}
      />
    </div>
  );
}

interface SetReleaseDetailProps {
  action: Extract<PlanAction, { type: 'set_release' }>;
  planItems: PlanItem[];
}

export function SetReleaseDetail({ action, planItems }: SetReleaseDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);

  if (!item) {
    return <MissingItemMessage />;
  }

  return (
    <div className="space-y-4">
      <HeaderBadge type="Release Tag" color="bg-info/12 text-info" itemTitle={item.title} />

      <FieldChange
        fieldName="Release Tag"
        oldValue={item.release_tag}
        newValue={action.release_tag}
        renderValue={(value) => value ? (
          <span className="text-tiny font-mono px-2 py-1 rounded bg-surface-2 text-text-primary">#{value}</span>
        ) : (
          <span className="text-xs text-text-tertiary italic">none</span>
        )}
      />
    </div>
  );
}

interface SetPositionDetailProps {
  action: Extract<PlanAction, { type: 'set_position' }>;
  planItems: PlanItem[];
}

export function SetPositionDetail({ action, planItems }: SetPositionDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);

  if (!item) {
    return <MissingItemMessage />;
  }

  return (
    <div className="space-y-4">
      <HeaderBadge type="Position" color="bg-info/12 text-info" itemTitle={item.title} />

      <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="flex items-center gap-4">
          {/* Old position */}
          <div className="flex-1">
            <div className="text-xxs font-medium text-danger/70 uppercase tracking-wide mb-2">From</div>
            <div className="p-2 rounded-md bg-danger/5 border border-danger/15 font-mono text-xs">
              {item.position_x !== null && item.position_y !== null ? (
                <span>({item.position_x}, {item.position_y})</span>
              ) : (
                <span className="text-text-tertiary italic">not set</span>
              )}
            </div>
          </div>

          <div className="text-text-muted text-lg">{'\u2192'}</div>

          {/* New position */}
          <div className="flex-1">
            <div className="text-xxs font-medium text-success/70 uppercase tracking-wide mb-2">To</div>
            <div className="p-2 rounded-md bg-success/5 border border-success/15 font-mono text-xs">
              <span>({action.x}, {action.y})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReorderDetailProps {
  action: Extract<PlanAction, { type: 'reorder' }>;
  planItems: PlanItem[];
}

export function ReorderDetail({ action, planItems }: ReorderDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);
  const afterItem = action.after_item_id ? planItems.find(i => i.id === action.after_item_id) : null;

  if (!item) {
    return <MissingItemMessage />;
  }

  return (
    <div className="space-y-4">
      <HeaderBadge type="Reorder" color="bg-info/12 text-info" itemTitle={item.title} />

      <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <p className="text-xs text-text-secondary">
          Move <span className="font-medium text-text-primary">"{item.title}"</span> to be{' '}
          {afterItem ? (
            <>after <span className="font-medium text-text-primary">"{afterItem.title}"</span></>
          ) : (
            <span className="font-medium text-text-primary">first in the list</span>
          )}
        </p>
      </div>
    </div>
  );
}

interface QueueForTrackerDetailProps {
  action: Extract<PlanAction, { type: 'queue_for_tracker' }>;
  planItems: PlanItem[];
}

export function QueueForTrackerDetail({ action, planItems }: QueueForTrackerDetailProps) {
  const items = action.item_ids.map(id => planItems.find(i => i.id === id)).filter(Boolean) as PlanItem[];
  const missingCount = action.item_ids.length - items.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-accent/12 text-accent">
          Queue for Export
        </span>
        <span className="text-xxs text-text-muted">
          {action.item_ids.length} item{action.item_ids.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Items list */}
      <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="text-xxs font-medium text-text-muted uppercase tracking-wide mb-2">Items to Queue</div>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="text-xs text-text-secondary flex items-center gap-2">
              <span className="text-accent">{'\u2022'}</span>
              <span className="truncate">{item.title}</span>
              {item.label && (
                <span className="text-xxs font-medium px-1.5 py-0.5 rounded bg-surface-2 text-text-muted flex-shrink-0">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ul>
        {missingCount > 0 && (
          <p className="text-xs text-warning mt-2">
            {missingCount} item{missingCount !== 1 ? 's' : ''} not found
          </p>
        )}
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-surface-2 border border-border-subtle">
        <p className="text-xs text-text-muted">
          These items will be added to the export queue for syncing with your connected tracker.
        </p>
      </div>
    </div>
  );
}

// Helper components

function MissingItemMessage() {
  return (
    <div className="p-4 rounded-lg bg-danger/8 border border-danger/15">
      <p className="text-sm text-danger">Item not found (may have been deleted)</p>
    </div>
  );
}

interface HeaderBadgeProps {
  type: string;
  color: string;
  itemTitle: string;
}

function HeaderBadge({ type, color, itemTitle }: HeaderBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded ${color}`}>
        {type}
      </span>
      <span className="text-xs text-text-secondary truncate">{itemTitle}</span>
    </div>
  );
}

interface FieldChangeProps<T> {
  fieldName: string;
  oldValue: T | null;
  newValue: T | null;
  renderValue: (value: T | null) => React.ReactNode;
}

function FieldChange<T>({ fieldName, oldValue, newValue, renderValue }: FieldChangeProps<T>) {
  return (
    <div>
      <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1.5">{fieldName}</div>
      <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="flex-1">
          <div className="text-xxs font-medium text-danger/70 uppercase tracking-wide mb-2">Before</div>
          {renderValue(oldValue)}
        </div>
        <div className="text-text-muted text-lg">{'\u2192'}</div>
        <div className="flex-1">
          <div className="text-xxs font-medium text-success/70 uppercase tracking-wide mb-2">After</div>
          {renderValue(newValue)}
        </div>
      </div>
    </div>
  );
}
