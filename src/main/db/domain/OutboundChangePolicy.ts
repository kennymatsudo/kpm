import { isOutboundItemChange, type StatusCategory } from '../../../shared/types';
import type { IOutboundChangeRepository, ITrackerRepository } from '../interfaces';
import { getConfig } from '../../config';

type QueueSource = 'user' | 'claude';

interface ExportableUpdates {
  title?: string;
  description?: string | null;
  status_category?: StatusCategory | null;
}

interface QueuePolicyItem {
  id: string;
  project_id?: string | null;
  external_key: string | null;
  external_id?: string | null;
  external_type?: 'jira' | 'linear' | null;
  association_id: string | null;
  status_category?: string | null;
}

export interface OutboundChangePolicyDeps {
  outboundChanges: IOutboundChangeRepository;
  tracker: ITrackerRepository;
}

export function resolveOperation(item: { external_key: string | null }): 'create' | 'update' {
  return item.external_key ? 'update' : 'create';
}

/**
 * Auto-queue path: fires when a plan-item field changes (IPC edit or `update_item`
 * plan action). Linked items always queue an update. New items only
 * auto-queue for create when the project has exactly one tracker association —
 * with more than one, the user must pick via the right-click menu.
 */
export function applyAutoQueue(
  item: QueuePolicyItem,
  updates: ExportableUpdates,
  queuedBy: QueueSource,
  deps: OutboundChangePolicyDeps
): void {
  if (!item.project_id) return;

  const hasExportableChange =
    updates.title !== undefined ||
    updates.description !== undefined ||
    updates.status_category !== undefined;

  const existing = deps.outboundChanges.getByPlanItem(item.id);
  if (existing) {
    if (updates.status_category !== undefined) {
      deps.outboundChanges.updateStatusCategory(existing.id, updates.status_category ?? null);
    }
    return;
  }

  if (hasExportableChange && item.external_key && item.association_id) {
    deps.outboundChanges.add({
      kpm_project_id: item.project_id,
      plan_item_id: item.id,
      association_id: item.association_id,
      operation: 'update',
      queued_by: queuedBy,
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: updates.status_category ?? null,
    });
    const changedFields = Object.keys(updates).filter(k =>
      ['title', 'description', 'status_category'].includes(k)
    );
    if (getConfig().claude.debug) console.log(`[OutboundChangePolicy] Auto-queued ${item.external_key} for update (changed: ${changedFields.join(', ')})`);
    return;
  }

  if (!item.external_key && updates.status_category) {
    const associations = deps.tracker.getAssociationsByProject(item.project_id);
    if (associations.length === 1) {
      const association = associations[0];
      deps.outboundChanges.add({
        kpm_project_id: item.project_id,
        plan_item_id: item.id,
        association_id: association.id,
        operation: 'create',
        queued_by: queuedBy,
        target_issue_type_id: null,
        target_issue_type_name: null,
        target_parent_key: null,
        target_status_category: updates.status_category,
      });
      if (getConfig().claude.debug) console.log(`[OutboundChangePolicy] Auto-queued new item for create to Jira (status: ${updates.status_category})`);
    }
  }
}

/**
 * Stages a tracker deletion before its linked plan item is removed. The row
 * snapshots the remote identity because the plan item is gone by export time.
 */
export function queueTrackerDeletionIfNeeded(
  item: QueuePolicyItem,
  queuedBy: QueueSource,
  deps: Pick<OutboundChangePolicyDeps, 'outboundChanges'>
): void {
  if (!item.project_id || !item.external_key || !item.external_type || !item.association_id) return;

  const alreadyQueued = deps.outboundChanges.getByAssociation(item.association_id).some(
    (change) => change.operation === 'delete' && change.external_key === item.external_key
  );
  if (alreadyQueued) return;

  deps.outboundChanges.addDelete({
    kpm_project_id: item.project_id,
    association_id: item.association_id,
    external_key: item.external_key,
    external_id: item.external_id ?? null,
    tracker_type: item.external_type,
    queued_by: queuedBy,
  });
}

interface AdmissionItem {
  id: string;
  parent_id?: string | null;
  external_key: string | null;
  status_category?: string | null;
}

export interface ExplicitQueueDeps {
  planItems: { getByProject(projectId: string): AdmissionItem[] };
  outboundChanges: Pick<IOutboundChangeRepository, 'add' | 'updateStatusCategory' | 'getByProject'>;
}

export interface AdmissionOutcome {
  /** Newly staged, in the order they were admitted. Includes ancestors. */
  queued: string[];
  /** Already staged; their status target was brought up to date instead. */
  refreshed: string[];
  /** Only ever names an id the caller asked for, never an ancestor. */
  skipped: { id: string; reason: string }[];
}

/**
 * Walk up from each requested item, collecting ancestors that have never been
 * exported. An unsynced parent has no key for the child's export to point at,
 * so the export either refuses the child or silently reparents it under the
 * association's epic.
 */
function withUnsyncedAncestors(itemIds: string[], items: ReadonlyMap<string, AdmissionItem>): Set<string> {
  const admitted = new Set(itemIds);
  const walked = new Set<string>();

  for (const itemId of itemIds) {
    let currentId = items.get(itemId)?.parent_id ?? null;
    while (currentId && !walked.has(currentId)) {
      walked.add(currentId);
      const parent = items.get(currentId);
      if (!parent) break;
      if (!parent.external_key) admitted.add(currentId);
      currentId = parent.parent_id ?? null;
    }
  }

  return admitted;
}

/**
 * The one way an item enters the outbound queue by explicit request — the
 * user's Queue action and Claude's `queue_for_tracker` both come through here.
 * They used to be separate loops that had drifted apart: one dropped a repeat
 * request on the floor where the other refreshed its status target, and only
 * one pulled in unsynced ancestors.
 *
 * Which association to stage against stays with the caller, because that rule
 * genuinely differs: the user is asked when a project has more than one, and
 * the plan action carries its own intent.
 */
export function admitExplicitQueue(input: {
  projectId: string;
  itemIds: string[];
  associationId: string;
  queuedBy: QueueSource;
  deps: ExplicitQueueDeps;
}): AdmissionOutcome {
  const { projectId, itemIds, associationId, queuedBy, deps } = input;
  const outcome: AdmissionOutcome = { queued: [], refreshed: [], skipped: [] };

  const items = new Map(deps.planItems.getByProject(projectId).map((item) => [item.id, item]));
  const requested = new Set(itemIds);
  const staged = new Map(
    deps.outboundChanges
      .getByProject(projectId)
      .filter(isOutboundItemChange)
      .map((entry) => [entry.plan_item_id, entry.id]),
  );

  for (const itemId of withUnsyncedAncestors(itemIds, items)) {
    const item = items.get(itemId);
    if (!item) {
      if (requested.has(itemId)) outcome.skipped.push({ id: itemId, reason: 'Item not found' });
      continue;
    }

    const stagedEntryId = staged.get(itemId);
    if (stagedEntryId) {
      // A second request with a newer status must not be dropped: the staged
      // row is what gets exported, so its target moves to the current value.
      if (item.status_category) {
        deps.outboundChanges.updateStatusCategory(stagedEntryId, item.status_category);
      }
      outcome.refreshed.push(itemId);
      continue;
    }

    deps.outboundChanges.add({
      kpm_project_id: projectId,
      plan_item_id: itemId,
      association_id: associationId,
      operation: resolveOperation(item),
      queued_by: queuedBy,
      target_issue_type_id: null,
      target_issue_type_name: null,
      target_parent_key: null,
      target_status_category: (item.status_category as StatusCategory | null) ?? null,
      custom_field_overrides: null,
    });
    outcome.queued.push(itemId);
  }

  return outcome;
}

export type QueueTrackerUpdateIfNeeded = (
  item: QueuePolicyItem,
  updates: ExportableUpdates,
  queuedBy: QueueSource
) => void;

export type QueueTrackerDeletionIfNeeded = (
  item: QueuePolicyItem,
  queuedBy: QueueSource
) => void;
