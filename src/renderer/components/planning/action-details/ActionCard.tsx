/**
 * ActionCard - List item row for plan actions in the review modal.
 * Shows action type badge, summary text, and selection state.
 */

import type { PlanAction, PlanItem } from '../../../../shared/types';

interface ActionCardProps {
  action: PlanAction;
  index: number;
  isActive: boolean;
  planItems: PlanItem[];
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
  onSelect: () => void;
}

export function ActionCard({ action, index, isActive, planItems, placeholderMap, onSelect }: ActionCardProps) {
  const { icon, color, label } = getActionStyle(action.type);
  const summary = describeAction(action, planItems, placeholderMap);

  return (
    <div
      onClick={onSelect}
      className={`
        group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-100
        ${isActive
          ? 'bg-accent/8 ring-1 ring-accent/20'
          : 'hover:bg-surface-1'
        }
      `}
    >
      {/* Action index badge */}
      <div className="w-5 h-5 rounded-md bg-surface-2 flex items-center justify-center flex-shrink-0">
        <span className="text-xxs font-medium text-text-muted tabular-nums">{index + 1}</span>
      </div>

      {/* Action type badge */}
      <span className={`
        text-xxs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0
        ${color}
      `}>
        {label}
      </span>

      {/* Summary text */}
      <span className={`text-tiny truncate leading-tight flex-1 min-w-0 ${isActive ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
        {summary}
      </span>

      {/* Action icon */}
      <span className="text-text-muted/50 text-xs flex-shrink-0">{icon}</span>
    </div>
  );
}

function getActionStyle(type: PlanAction['type']): { icon: string; color: string; label: string } {
  switch (type) {
    case 'create_item':
      return { icon: '+', color: 'bg-success/12 text-success', label: 'Create' };
    case 'update_item':
      return { icon: '\u270e', color: 'bg-info/12 text-info', label: 'Update' };
    case 'delete_item':
      return { icon: '\u00d7', color: 'bg-danger/12 text-danger', label: 'Delete' };
    case 'reparent':
      return { icon: '\u2197', color: 'bg-warning/12 text-warning', label: 'Move' };
    case 'set_label':
      return { icon: '\u25cf', color: 'bg-info/12 text-info', label: 'Label' };
    case 'set_release':
      return { icon: '#', color: 'bg-info/12 text-info', label: 'Release' };
    case 'add_dependency':
      return { icon: '\u27f6', color: 'bg-accent/12 text-accent', label: 'Link' };
    case 'remove_dependency':
      return { icon: '\u2715', color: 'bg-warning/12 text-warning', label: 'Unlink' };
    case 'reorder':
      return { icon: '\u2195', color: 'bg-info/12 text-info', label: 'Reorder' };
    case 'set_position':
      return { icon: '\u271b', color: 'bg-info/12 text-info', label: 'Position' };
    case 'queue_for_tracker':
      return { icon: '\u2191', color: 'bg-accent/12 text-accent', label: 'Queue' };
    case 'create_group':
      return { icon: '\u25a1', color: 'bg-success/12 text-success', label: 'Group' };
    case 'update_group':
      return { icon: '\u270e', color: 'bg-info/12 text-info', label: 'Group' };
    case 'delete_group':
      return { icon: '\u00d7', color: 'bg-danger/12 text-danger', label: 'Group' };
    case 'assign_to_group':
      return { icon: '\u2192', color: 'bg-info/12 text-info', label: 'Assign' };
    default:
      return { icon: '\u2022', color: 'bg-surface-3 text-text-muted', label: 'Action' };
  }
}

function describeAction(
  action: PlanAction,
  planItems: PlanItem[],
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>
): string {
  const getTitle = (id: string): string => {
    // Check if it's a placeholder ID first
    if (id.startsWith('$')) {
      const placeholder = placeholderMap.get(id);
      return placeholder?.title || `[New item ${id}]`;
    }
    const item = planItems.find(i => i.id === id);
    return item?.title || '[missing item]';
  };

  switch (action.type) {
    case 'create_item':
      return action.title;
    case 'update_item':
      return getTitle(action.item_id);
    case 'delete_item':
      return getTitle(action.item_id);
    case 'reparent':
      return getTitle(action.item_id);
    case 'set_label':
      return `${getTitle(action.item_id)} \u2192 ${action.label}`;
    case 'set_release':
      return `${getTitle(action.item_id)} \u2192 ${action.release_tag || 'none'}`;
    case 'add_dependency':
      return `${getTitle(action.from_id)} \u2192 ${getTitle(action.to_id)}`;
    case 'remove_dependency':
      return 'Remove dependency';
    case 'reorder':
      return getTitle(action.item_id);
    case 'set_position':
      return getTitle(action.item_id);
    case 'queue_for_tracker':
      return `${action.item_ids.length} item${action.item_ids.length !== 1 ? 's' : ''}`;
    case 'create_group':
      return action.name;
    case 'update_group':
      return `Update group`;
    case 'delete_group':
      return `Delete group`;
    case 'assign_to_group':
      return `${getTitle(action.item_id)} ${action.group_id ? '\u2192 group' : '\u2192 ungroup'}`;
    default:
      return 'Unknown action';
  }
}
