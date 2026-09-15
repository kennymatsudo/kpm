import type { Database } from 'better-sqlite3';
import type {
  IExternalPlanItemRepository,
  IPlanItemRepository,
  ISyncRepository,
  ITrackerRepository,
} from '../interfaces';
import { recordTrackerAgreement } from './trackerAgreement';
import type { TrackerClient, ExternalIssue } from '../../trackers';
import { fetchIssuesWithSubtasks, inferCategoryWithMapping } from '../../trackers';
import type {
  ImportPreview,
  ImportIssueTypeGroup,
  ImportResult,
  TrackerProgressCallback,
} from '../../../shared/types';
import { externalPeopleFields } from './externalPeopleFields';

export interface ImportServiceDeps {
  database: Database;
  tracker: ITrackerRepository;
  planItems: IPlanItemRepository;
  externalPlanItems: IExternalPlanItemRepository;
  sync: ISyncRepository;
}

export function createImportService(deps: ImportServiceDeps) {
  const TrackerRepository = deps.tracker;
  const ExternalPlanItemRepository = deps.externalPlanItems;

  return {
    /**
     * Generate a preview of issues to import from external tracker.
     * Groups issues by type for user selection.
     */
    async generateImportPreview(
      projectId: string,
      associationId: string,
      client: TrackerClient,
      onProgress?: TrackerProgressCallback
    ): Promise<ImportPreview> {
      const association = TrackerRepository.getAssociationById(associationId);
      if (!association) {
        throw new Error('Association not found');
      }

      // Fetch all issues including subtasks recursively
      const issues = await fetchIssuesWithSubtasks(
        client,
        association.issue_filter,
        (fetched) => onProgress?.({ projectId, associationId, phase: 'fetching', current: fetched })
      );

      // Group issues by type
      const issuesByTypeMap = new Map<string, ExternalIssue[]>();
      for (const issue of issues) {
        const group = issuesByTypeMap.get(issue.issueType) ?? [];
        group.push(issue);
        issuesByTypeMap.set(issue.issueType, group);
      }

      // Sort by type priority and build preview groups
      const issuesByType: ImportIssueTypeGroup[] = Array.from(issuesByTypeMap.entries())
        .sort((a, b) => {
          const priority: Record<string, number> = { Epic: 0, Story: 1, Task: 2, 'Sub-task': 3, Bug: 4 };
          return (priority[a[0]] ?? 99) - (priority[b[0]] ?? 99);
        })
        .map(([type, typeIssues]) => ({
          type,
          count: typeIssues.length,
          selected: true,
          issues: typeIssues.map(issue => ({
            key: issue.key,
            title: issue.title,
            parent_key: issue.parentKey,
          })),
        }));

      return {
        tracker_type: client.type,
        external_project_key: association.project_key,
        total_count: issues.length,
        issues_by_type: issuesByType,
      };
    },

    /**
     * Import issues from external tracker and create plan items.
     * Links sub-tasks to their parents after creation.
     */
    async importIssues(
      projectId: string,
      associationId: string,
      client: TrackerClient,
      options?: {
        selectedTypes?: string[];
        onProgress?: TrackerProgressCallback;
      }
    ): Promise<ImportResult> {
      const { selectedTypes, onProgress } = options ?? {};

      const association = TrackerRepository.getAssociationById(associationId);
      if (!association) {
        throw new Error('Association not found');
      }

      const result: ImportResult = {
        success: true,
        created: 0,
        errors: [],
      };

      const allIssues = await fetchIssuesWithSubtasks(
        client,
        association.issue_filter,
        (fetched) => onProgress?.({ projectId, associationId, phase: 'fetching', current: fetched })
      );

      const issues = selectedTypes
        ? allIssues.filter(issue => selectedTypes.includes(issue.issueType))
        : allIssues;

      onProgress?.({
        projectId,
        associationId,
        phase: 'importing',
        total: issues.length,
        current: 0,
      });

      const inputs = issues.map(issue => ({
        project_id: projectId,
        association_id: associationId,
        title: issue.title,
        description: issue.description,
        external_key: issue.key,
        external_id: issue.id,
        external_type: client.type,
        external_issue_type: issue.issueType,
        external_status: issue.status,
        status_category: inferCategoryWithMapping(
          issue.status,
          association.status_mapping,
          { trackerType: client.type, stateType: issue.statusType ?? null }
        ),
        external_url: issue.url,
        external_parent_key: issue.parentKey,
        external_epic_key: issue.epicKey,
        ...externalPeopleFields(issue),
      }));

      try {
        const createdItems = ExternalPlanItemRepository.importExternalIssues(inputs);
        result.created = createdItems.length;

        ExternalPlanItemRepository.linkSubtasksToParentIssues(projectId, client.type);

        const issueByKey = new Map(issues.map(i => [i.key, i]));
        deps.database.transaction(() => {
          for (const item of createdItems) {
            const issue = issueByKey.get(item.external_key!);
            if (issue) recordTrackerAgreement(item.id, issue, {}, deps);
          }
        })();

        TrackerRepository.updateAssociationLastSynced(associationId);
      } catch (error) {
        result.success = false;
        result.errors.push({
          external_key: 'bulk',
          error: error instanceof Error ? error.message : 'Failed to create items',
        });
      }

      onProgress?.({
        projectId,
        associationId,
        phase: 'complete',
      });

      return result;
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
