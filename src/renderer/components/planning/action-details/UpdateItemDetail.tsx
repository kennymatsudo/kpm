/**
 * UpdateItemDetail - Detail view for update_item actions.
 * Shows diff view for each changed field.
 */

import { DiffViewer } from '../../ui/DiffViewer';

interface UpdateItemDetailProps {
  action: Extract<PlanAction, { type: 'update_item' }>;
  planItems: PlanItem[];
}

export function UpdateItemDetail({ action, planItems }: UpdateItemDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);

  if (!item) {
    return (
      <div className="p-4 rounded-lg bg-danger/8 border border-danger/15">
        <p className="text-sm text-danger">Item not found (may have been deleted)</p>
      </div>
    );
  }

  const updates = action.updates;
  const changedFields: { field: string; oldValue: string | null; newValue: string | null }[] = [];

  if (updates.title !== undefined && updates.title !== item.title) {
    changedFields.push({ field: 'title', oldValue: item.title, newValue: updates.title });
  }
  if (updates.description !== undefined && updates.description !== item.description) {
    changedFields.push({ field: 'description', oldValue: item.description, newValue: updates.description });
  }
  if (updates.label !== undefined && updates.label !== item.label) {
    changedFields.push({ field: 'label', oldValue: item.label, newValue: updates.label });
  }
  if (updates.release_tag !== undefined && updates.release_tag !== item.release_tag) {
    changedFields.push({ field: 'release_tag', oldValue: item.release_tag, newValue: updates.release_tag });
  }
  if (updates.status_category !== undefined && updates.status_category !== item.status_category) {
    changedFields.push({ field: 'status_category', oldValue: item.status_category, newValue: updates.status_category });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
          Update
        </span>
        <span className="text-xs text-text-secondary truncate">{item.title}</span>
      </div>

      {changedFields.length === 0 ? (
        <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
          <p className="text-xs text-text-muted italic">No changes detected</p>
        </div>
      ) : (
        <div className="space-y-4">
          {changedFields.map(({ field, oldValue, newValue }) => (
            <div key={field}>
                {formatFieldName(field)}
              </div>
              {field === 'description' ? (
              ) : (
                <FieldChange field={field} oldValue={oldValue} newValue={newValue} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldChangeProps {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

function FieldChange({ field, oldValue, newValue }: FieldChangeProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-1 border border-border-subtle">
      {/* Old value */}
      <div className="flex-1 min-w-0">
        {renderFieldValue(field, oldValue, 'danger')}
      </div>

      {/* Arrow */}

      {/* New value */}
      <div className="flex-1 min-w-0">
        {renderFieldValue(field, newValue, 'success')}
      </div>
    </div>
  );
}

function renderFieldValue(field: string, value: string | null, accent: 'danger' | 'success') {
  if (!value) {
    return <span className="text-xs text-text-tertiary italic">none</span>;
  }

  if (field === 'label' || field === 'status_category') {
    return (
      <span className={`
        ${accent === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}
      `}>
        {formatStatusCategory(value)}
      </span>
    );
  }

  if (field === 'release_tag') {
    return (
      <span className={`
        ${accent === 'success' ? 'text-success' : 'text-danger'}
      `}>
        #{value}
      </span>
    );
  }

  return <span className="text-xs text-text-secondary truncate block">{value}</span>;
}

function formatFieldName(field: string): string {
  switch (field) {
    case 'title': return 'Title';
    case 'description': return 'Description';
    case 'label': return 'Label';
    case 'release_tag': return 'Release Tag';
    case 'status_category': return 'Status';
    default: return field;
  }
}

function formatStatusCategory(status: string): string {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
