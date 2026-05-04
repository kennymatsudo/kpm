/**
 * PendingActionsPanel - Review and approve proposed plan changes from Claude.
 *
 * Two states:
 * 1. Collapsed: Floating panel at bottom with summary and quick actions
 * 2. Expanded: Full modal with split-view (action list + detail view)
 *
 * Uses all-or-nothing approval: approve all actions or dismiss all.
 */

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import type { PlanAction, PlanItem } from '../../../shared/types';
import { LoadingSpinner } from '../ui/LoadingButton';
import { MotionButton } from '../ui/MotionButton';
import { CloseIcon } from '../icons';
import { Z_INDEX } from '../../constants/zIndex';
import {
  ActionCard,
  CreateItemDetail,
  UpdateItemDetail,
  DeleteItemDetail,
  ReparentDetail,
  AddDependencyDetail,
  RemoveDependencyDetail,
  SetLabelDetail,
  SetReleaseDetail,
  SetPositionDetail,
  ReorderDetail,
  QueueForTrackerDetail,
} from './action-details';

interface PendingActionsPanelProps {
  actions: PlanAction[];
  planItems: PlanItem[];
  onApprove: () => void;
  onDismiss: () => void;
  isApplying?: boolean;
  /** When true, renders inline content for embedding in a side panel (no floating panel/modal) */
  embedded?: boolean;
}

export function PendingActionsPanel({ actions, planItems, onApprove, onDismiss, isApplying = false, embedded = false }: PendingActionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);

  // Build placeholder map for resolving $N references to items being created
  const placeholderMap = useMemo(() => buildPlaceholderMap(actions), [actions]);
  const planItemIds = useMemo(() => new Set(planItems.map((item) => item.id)), [planItems]);
  const planItemsById = useMemo(() => new Map(planItems.map((item) => [item.id, item])), [planItems]);

  // Get action summary for collapsed view
  const actionSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    actions.forEach(action => {
      const type = getActionTypeLabel(action.type);
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [actions]);

  // Check if any action references a missing item
  const hasMissingItems = useMemo(() => {
    return actions.some(action => {
      if ('item_id' in action && typeof action.item_id === 'string') {
        return !planItemIds.has(action.item_id);
      }
      if ('from_id' in action && typeof action.from_id === 'string') {
        if (!action.from_id.startsWith('$') && !planItemIds.has(action.from_id)) return true;
      }
      if ('to_id' in action && typeof action.to_id === 'string') {
        if (!action.to_id.startsWith('$') && !planItemIds.has(action.to_id)) return true;
      }
      return false;
    });
  }, [actions, planItemIds]);

  // Keep selected index in bounds
  const safeSelectedIndex = Math.min(selectedActionIndex, actions.length - 1);
  const selectedAction = actions[safeSelectedIndex];

  if (actions.length === 0) return null;

  // Collapsed panel (floating at bottom)
  const collapsedPanel = (
    <m.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2
                  bg-surface-2 border-2 border-accent rounded shadow-md
                  p-3 w-[28rem]"
      style={{ zIndex: Z_INDEX.panel }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="pulse-dot" />
        <span className="text-sm font-medium text-accent">
          Proposed Changes ({actions.length})
        </span>
      </div>

      {/* Action type summary */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(actionSummary).map(([type, count]) => (
          <span
            key={type}
            className="text-xxs font-medium px-2 py-0.5 rounded bg-surface-3 text-text-secondary"
          >
            {count} {type}
          </span>
        ))}
      </div>

      {/* Warning for missing items */}
      {hasMissingItems && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mb-3 text-xs text-warning">
          Some actions reference items that no longer exist. These will be skipped when applied.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <MotionButton
          variant="secondary"
          onClick={() => setIsExpanded(true)}
          className="flex-1"
        >
          Review Details
        </MotionButton>
        <MotionButton
          variant="primary"
          onClick={onApprove}
          disabled={isApplying}
          className="flex-1 disabled:opacity-70"
        >
          {isApplying ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner className="w-3.5 h-3.5" color="white" />
              Applying...
            </span>
          ) : (
            'Apply Changes'
          )}
        </MotionButton>
        <MotionButton
          variant="secondary"
          onClick={onDismiss}
          disabled={isApplying}
          className="disabled:opacity-50"
        >
          Dismiss
        </MotionButton>
      </div>
    </m.div>
  );

  // Expanded modal with split-view
  const expandedModal = createPortal(
    <AnimatePresence>
      {isExpanded && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-overlay flex items-center justify-center"
          style={{ zIndex: Z_INDEX.modal }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isApplying) setIsExpanded(false);
          }}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="dialog-content w-[900px] max-w-[90vw] h-[75vh] max-h-[800px] min-h-[500px] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface-2 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-accent/12 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary leading-tight">Review Proposed Changes</h2>
                  <p className="text-xxs text-text-muted">{actions.length} action{actions.length !== 1 ? 's' : ''} to review</p>
                </div>
              </div>
              <MotionButton
                scalePreset="default"
                onClick={() => setIsExpanded(false)}
                disabled={isApplying}
                className="text-text-muted hover:text-text-primary transition-colors p-1 hover:bg-surface-3 rounded disabled:opacity-50"
              >
                <CloseIcon className="w-5 h-5" />
              </MotionButton>
            </div>

            {/* Split view container */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Left panel - Action list */}
              <div className="w-64 flex-shrink-0 border-r border-border-subtle flex flex-col" style={{ background: 'var(--bg-canvas)' }}>
                <div className="px-3 py-3 border-b border-border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-tiny font-medium text-text-muted">Actions</span>
                    <span className="text-xxs text-text-muted/70 tabular-nums">{actions.length}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
                  <div className="space-y-0.5">
                    {actions.map((action, index) => (
                      <ActionCard
                        key={index}
                        action={action}
                        index={index}
                        isActive={index === safeSelectedIndex}
                        planItems={planItems}
                        placeholderMap={placeholderMap}
                        onSelect={() => setSelectedActionIndex(index)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Right panel - Detail view */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--surface-0)' }}>
                <div className="flex-1 overflow-y-auto p-4">
                  {selectedAction ? (
                      <ActionDetailView
                        action={selectedAction}
                        planItems={planItems}
                        planItemsById={planItemsById}
                        placeholderMap={placeholderMap}
                      />
                  ) : (
                    <div className="flex items-center justify-center h-full text-text-muted text-xs">
                      Select an action to view details
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-between flex-shrink-0" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center gap-3">
                {hasMissingItems && (
                  <p className="text-xs text-warning">Some items missing - will be skipped</p>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    onDismiss();
                    setIsExpanded(false);
                  }}
                  disabled={isApplying}
                  className="px-3.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-2"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    onApprove();
                    setIsExpanded(false);
                  }}
                  disabled={isApplying}
                  className={`
                    px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-2
                    ${!isApplying
                      ? 'bg-accent text-white hover:bg-accent-hover active:opacity-90 cursor-pointer'
                      : 'bg-surface-3 text-text-muted cursor-not-allowed'
                    }
                  `}
                >
                  {isApplying ? (
                    <>
                      <LoadingSpinner className="w-3.5 h-3.5" color="white" />
                      <span>Applying...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Apply All Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );

  // Embedded mode: render inline content for side panel
  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        {/* Summary header */}
        <div className="flex-shrink-0 px-4 py-3 bg-surface-0/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-secondary">
                {actions.length} {actions.length === 1 ? 'change' : 'changes'} to review
              </span>
            </div>
            {/* Action type summary chips */}
            <div className="flex items-center gap-1.5">
              {Object.entries(actionSummary).slice(0, 3).map(([type, count]) => (
                <span
                  key={type}
                  className="text-xxs font-semibold uppercase tracking-wider
                             px-2 py-0.5 rounded-md
                             bg-surface-3 text-text-muted"
                >
                  {count} {type}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Action list */}
        <div className="flex-shrink-0 border-y border-border-subtle bg-surface-0">
          <div className="max-h-52 overflow-y-auto py-2 px-2">
            <div className="space-y-1">
              {actions.map((action, index) => (
                <ActionCard
                  key={index}
                  action={action}
                  index={index}
                  isActive={index === safeSelectedIndex}
                  planItems={planItems}
                  placeholderMap={placeholderMap}
                  onSelect={() => setSelectedActionIndex(index)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Detail view */}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-surface-1">
          {selectedAction ? (
            <m.div
              key={safeSelectedIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ActionDetailView
                action={selectedAction}
                planItems={planItems}
                planItemsById={planItemsById}
                placeholderMap={placeholderMap}
              />
            </m.div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <span className="text-xs">Select an action to view details</span>
            </div>
          )}
        </div>

        {/* Warning for missing items */}
        {hasMissingItems && (
          <div className="mx-4 mb-3">
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg
                            bg-warning/8 border border-warning/20">
              <svg className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-warning/90 leading-relaxed">
                Some actions reference items that no longer exist and will be skipped.
              </p>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex-shrink-0 px-3 py-2.5 border-t border-border-subtle bg-surface-2">
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              disabled={isApplying}
              className="flex-1 px-3 py-2 text-xs font-medium
                         text-text-secondary hover:text-text-primary
                         bg-surface-3 hover:bg-surface-4
                         rounded transition-colors duration-100
                         border border-border-subtle
                         active:opacity-90
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-3"
            >
              Dismiss
            </button>
            <button
              onClick={onApprove}
              disabled={isApplying}
              className="flex-[1.5] px-3 py-2 text-xs font-semibold text-white
                         bg-[color-mix(in_srgb,var(--color-accent)_85%,black)]
                         hover:bg-accent
                         rounded transition-colors duration-100
                         active:opacity-90
                         disabled:opacity-70 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {isApplying ? (
                <>
                  <LoadingSpinner className="w-3.5 h-3.5" color="white" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Apply All Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {!isExpanded && collapsedPanel}
      </AnimatePresence>
      {expandedModal}
    </>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface ActionDetailViewProps {
  action: PlanAction;
  planItems: PlanItem[];
  planItemsById: Map<string, PlanItem>;
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
}

function ActionDetailView({ action, planItems, planItemsById, placeholderMap }: ActionDetailViewProps) {
  switch (action.type) {
    case 'create_item':
      return <CreateItemDetail action={action} planItems={planItems} placeholderMap={placeholderMap} />;
    case 'update_item':
      return <UpdateItemDetail action={action} planItems={planItems} />;
    case 'delete_item':
      return <DeleteItemDetail action={action} planItems={planItems} />;
    case 'reparent':
      return <ReparentDetail action={action} planItems={planItems} placeholderMap={placeholderMap} />;
    case 'set_label':
      return <SetLabelDetail action={action} planItems={planItems} />;
    case 'set_release':
      return <SetReleaseDetail action={action} planItems={planItems} />;
    case 'add_dependency':
      return <AddDependencyDetail action={action} planItems={planItems} placeholderMap={placeholderMap} />;
    case 'remove_dependency':
      return <RemoveDependencyDetail action={action} />;
    case 'reorder':
      return <ReorderDetail action={action} planItems={planItems} />;
    case 'set_position':
      return <SetPositionDetail action={action} planItems={planItems} />;
    case 'queue_for_tracker':
      return <QueueForTrackerDetail action={action} planItems={planItems} />;
    case 'create_group':
      return (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
            <h4 className="text-xs font-medium text-text-primary mb-2">Create Group</h4>
            <div className="space-y-1.5 text-xs">
              <p><span className="text-text-muted">Name:</span> <span className="text-text-primary">{action.name}</span></p>
              <p><span className="text-text-muted">Size:</span> <span className="text-text-primary">{action.width} x {action.height}</span></p>
            </div>
          </div>
        </div>
      );
    case 'update_group':
      return (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
            <h4 className="text-xs font-medium text-text-primary mb-2">Update Group</h4>
            <div className="space-y-1.5 text-xs">
              {action.updates.name && <p><span className="text-text-muted">Name:</span> <span className="text-text-primary">{action.updates.name}</span></p>}
              {(action.updates.width || action.updates.height) && <p><span className="text-text-muted">Size:</span> <span className="text-text-primary">{action.updates.width} x {action.updates.height}</span></p>}
            </div>
          </div>
        </div>
      );
    case 'delete_group':
      return (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-danger/8 border border-danger/20">
            <h4 className="text-xs font-medium text-danger mb-2">Delete Group</h4>
            <p className="text-xs text-text-secondary">This group container will be removed. Items inside will remain in place.</p>
          </div>
        </div>
      );
    case 'assign_to_group': {
      const item = planItemsById.get(action.item_id);
      return (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
            <h4 className="text-xs font-medium text-text-primary mb-2">{action.group_id ? 'Assign to Group' : 'Remove from Group'}</h4>
            <p className="text-xs text-text-secondary">
              {action.group_id
                ? `Move "${item?.title || 'Item'}" into a group container.`
                : `Remove "${item?.title || 'Item'}" from its current group.`}
            </p>
          </div>
        </div>
      );
    }
    default:
      return (
        <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
          <p className="text-xs text-text-muted">Unknown action type</p>
        </div>
      );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a map of placeholder IDs ($1, $2, etc.) to their created item info.
 * Placeholders are 1-indexed based on the position of create_item actions.
 */
function buildPlaceholderMap(actions: PlanAction[]): Map<string, { title: string; description?: string; label?: string }> {
  const map = new Map<string, { title: string; description?: string; label?: string }>();
  let createIndex = 1;

  actions.forEach((action) => {
    if (action.type === 'create_item') {
      map.set(`$${createIndex}`, {
        title: action.title,
        description: action.description,
        label: action.label,
      });
      createIndex++;
    }
  });

  return map;
}

function getActionTypeLabel(type: PlanAction['type']): string {
  switch (type) {
    case 'create_item': return 'create';
    case 'update_item': return 'update';
    case 'delete_item': return 'delete';
    case 'reparent': return 'move';
    case 'set_label': return 'label';
    case 'set_release': return 'release';
    case 'add_dependency': return 'link';
    case 'remove_dependency': return 'unlink';
    case 'reorder': return 'reorder';
    case 'set_position': return 'position';
    case 'queue_for_tracker': return 'queue';
    case 'create_group': return 'group';
    case 'update_group': return 'group';
    case 'delete_group': return 'group';
    case 'assign_to_group': return 'assign';
    default: return 'action';
  }
}
