import { admitExplicitQueue } from './OutboundChangePolicy';
import { getConfig } from '../../config';
import type { CustomFieldValues, ExportPreview, ExportResult, SyncReviewData } from '../../../shared/types';
import { inferCategoryWithMapping } from '../../trackers/statusTransitions';
import { executePlan, previewOf, pruneSettledChanges, resolveExportPlan, reviewOf, type ExportPlanDeps } from './ExportPlan';

export type ExportServiceDeps = ExportPlanDeps;

/**
 * Owns the outbound queue for a project — what is staged, with which targets —
 * and hands each export surface the same resolved `ExportPlan`.
 */
export function createExportService(deps: ExportServiceDeps) {
  const OutboundChangeRepository = deps.outboundChanges;
  const PlanItemRepository = deps.planItems;
  const TrackerRepository = deps.tracker;

  return {
  /**
   * The project's outbound queue, minus updates that no longer differ from
   * the tracker.
   */
  getQueue(kpmProjectId: string) {
    pruneSettledChanges(kpmProjectId, deps);
    return OutboundChangeRepository.getByProject(kpmProjectId);
  },

  /**
   * Add items to the sync queue.
   * Determines operation type (create vs update) based on external_key.
   * @param associationId - Optional association ID. If not provided and multiple
   *                        associations exist, all items will be skipped with an error.
   */
  queueItems(
    kpmProjectId: string,
    itemIds: string[],
    queuedBy: 'user' | 'claude',
    associationId?: string
  ): { queued: string[]; skipped: { id: string; reason: string }[] } {
    const queued: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    const associations = TrackerRepository.getAssociationsByProject(kpmProjectId);
    if (associations.length === 0) {
      for (const id of itemIds) {
        skipped.push({ id, reason: 'No tracker association configured for project' });
      }
      return { queued, skipped };
    }

    let association;
    if (associationId) {
      association = associations.find(a => a.id === associationId);
      if (!association) {
        for (const id of itemIds) {
          skipped.push({ id, reason: 'Specified tracker association not found' });
        }
        return { queued, skipped };
      }
    } else if (associations.length === 1) {
      association = associations[0];
    } else {
      for (const id of itemIds) {
        skipped.push({ id, reason: 'Multiple tracker associations exist - please specify which one to use' });
      }
      return { queued, skipped };
    }

    const outcome = admitExplicitQueue({
      projectId: kpmProjectId,
      itemIds,
      associationId: association.id,
      queuedBy,
      deps: { planItems: PlanItemRepository, outboundChanges: OutboundChangeRepository },
    });

    return { queued: [...queued, ...outcome.queued], skipped: [...skipped, ...outcome.skipped] };
  },

  /**
   * Remove an item from the queue.
   */
  removeFromQueue(queueEntryId: string): void {
    OutboundChangeRepository.remove(queueEntryId);
  },

  /**
   * Clear the entire queue for a project.
   */
  clearQueue(kpmProjectId: string): void {
    OutboundChangeRepository.removeByProject(kpmProjectId);
  },

  /**
   * Update queue entry status category.
   * If the new status matches what's synced to the tracker, removes from queue instead.
   * @returns { removed: true } if removed, { removed: false } if updated
   */
  updateQueueStatus(
    queueEntryId: string,
    statusCategory: string | null
  ): { removed: boolean } {
    const queueEntry = OutboundChangeRepository.get(queueEntryId);
    if (queueEntry?.plan_item_id && statusCategory) {
      const planItem = PlanItemRepository.get(queueEntry.plan_item_id);
      if (planItem?.external_status) {
        const association = TrackerRepository.getAssociationById(queueEntry.association_id);
        const syncedCategory = inferCategoryWithMapping(
          planItem.external_status,
          association?.status_mapping ?? null
        );
        if (syncedCategory === statusCategory) {
          if (getConfig().claude.debug) console.log(`[ExportService] Removing ${planItem.external_key} from queue - status reverted to synced value (${statusCategory})`);
          OutboundChangeRepository.remove(queueEntryId);
          return { removed: true };
        }
      }
    }
    OutboundChangeRepository.updateStatusCategory(queueEntryId, statusCategory);
    return { removed: false };
  },

  /**
   * Update custom field overrides for a queue entry.
   */
  updateQueueCustomFieldOverrides(
    queueEntryId: string,
    customFieldOverrides: CustomFieldValues | null
  ): void {
    const cleaned = customFieldOverrides && Object.keys(customFieldOverrides).length > 0
      ? customFieldOverrides
      : null;
    OutboundChangeRepository.update(queueEntryId, { custom_field_overrides: cleaned });
  },

  async generateExportPreview(kpmProjectId: string, associationId: string): Promise<ExportPreview> {
    return previewOf(await resolveExportPlan(kpmProjectId, associationId, deps));
  },

  async generateSyncReview(kpmProjectId: string, associationId: string): Promise<SyncReviewData> {
    return reviewOf(await resolveExportPlan(kpmProjectId, associationId, deps), deps);
  },

  async executeApprovedExport(
    kpmProjectId: string,
    associationId: string,
    approvedItemIds: string[],
    approvedDeleteIds: string[] = []
  ): Promise<ExportResult> {
    const plan = await resolveExportPlan(kpmProjectId, associationId, deps);
    return executePlan(plan, { itemIds: approvedItemIds, deleteIds: approvedDeleteIds }, deps);
  },
};
}

export type ExportService = ReturnType<typeof createExportService>;
