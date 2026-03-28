import type { ITypeMappingRepository } from '../interfaces';
import type { TrackerTypeMapping, JiraIssueType, PlanItem } from '../../../shared/types';

/**
 * Used when creating default mappings for a new project/scope.
 */
const DEFAULT_LABEL_MAPPINGS: Record<string, string[]> = {
  Epic: ['epic', 'initiative', 'project'],
  Story: ['story', 'feature', 'user-story'],
  Task: ['task', 'work'],
  'Sub-task': ['subtask', 'sub-task', 'sub_task'],
  Bug: ['bug', 'defect'],
  Spike: ['spike', 'research', 'investigation'],
};

/**
 * Depth-based fallback mappings when no label is configured.
 * Used when association has NO epic_key set.
 */
const DEPTH_FALLBACK: Record<number, string> = {
  0: 'Epic',
  1: 'Story',
  2: 'Task',
  3: 'Task',
  4: 'Sub-task',
};

/**
 * Shifted depth-based fallback when association HAS an epic_key.
 * Since the epic already exists, root items become Stories, not Epics.
 */
const DEPTH_FALLBACK_WITH_EPIC: Record<number, string> = {
  0: 'Story',
  1: 'Task',
  2: 'Task',
  3: 'Sub-task',
  4: 'Sub-task',
};

export interface TypeMappingServiceDeps {
  typeMappings: ITypeMappingRepository;
}

export function createTypeMappingService(deps: TypeMappingServiceDeps) {
  const TypeMappingRepository = deps.typeMappings;

  return {
    /**
     * Get all type mappings for a project.
     */
    getMappings(kpmProjectId: string): TrackerTypeMapping[] {
      return TypeMappingRepository.getByProject(kpmProjectId);
    },

    /**
     * Get mappings for a specific project and scope.
     */
    getMappingsByScope(kpmProjectId: string, scopeId: string): TrackerTypeMapping[] {
      return TypeMappingRepository.getByProjectAndScope(kpmProjectId, scopeId);
    },

    /**
     * Get a specific mapping by label.
     */
    getMapping(kpmProjectId: string, scopeId: string, kpmLabel: string): TrackerTypeMapping | null {
      return TypeMappingRepository.getMapping(kpmProjectId, scopeId, kpmLabel.toLowerCase()) ?? null;
    },

    /**
     * Save a type mapping.
     */
    saveMapping(
      kpmProjectId: string,
      scopeId: string,
      kpmLabel: string,
      trackerIssueTypeId: string,
      trackerIssueTypeName: string
    ): TrackerTypeMapping {
      return TypeMappingRepository.upsert(
        kpmProjectId,
        scopeId,
        kpmLabel.toLowerCase(),
        trackerIssueTypeId,
        trackerIssueTypeName
      );
    },

    /**
     * Remove a mapping.
     */
    removeMapping(mappingId: string): void {
      TypeMappingRepository.remove(mappingId);
    },

    /**
     * Create default mappings based on available Jira issue types.
     */
    createDefaultMappings(
      kpmProjectId: string,
      scopeId: string,
      availableTypes: JiraIssueType[]
    ): TrackerTypeMapping[] {
      const mappings: { kpmLabel: string; trackerIssueTypeId: string; trackerIssueTypeName: string }[] = [];

      // Build lookup map of Jira types by lowercase name
      const typesByName = new Map<string, JiraIssueType>();
      for (const type of availableTypes) {
        typesByName.set(type.name.toLowerCase(), type);
      }

      // Match default labels to Jira types
      for (const [jiraTypeName, kpmLabels] of Object.entries(DEFAULT_LABEL_MAPPINGS)) {
        const jiraType = typesByName.get(jiraTypeName.toLowerCase());
        if (!jiraType) continue;

        for (const label of kpmLabels) {
          mappings.push({
            kpmLabel: label,
            trackerIssueTypeId: jiraType.id,
            trackerIssueTypeName: jiraType.name,
          });
        }
      }

      // Bulk upsert all mappings
      TypeMappingRepository.bulkUpsert(kpmProjectId, scopeId, mappings);

      // Return the created mappings
      return TypeMappingRepository.getByProjectAndScope(kpmProjectId, scopeId);
    },

    /**
     * Resolve Jira issue type for a plan item.
     * Priority:
     * 1. Use external_issue_type directly (for synced items)
     * 2. Explicit mapping for the item's label (for local items with labels)
     * 3. If item has a syncable parent, use subtask type
     * 4. Depth-based fallback (shifts down if epic_key is set on association)
     * 5. null if no type can be resolved
     */
    resolveIssueType(
      planItem: PlanItem,
      kpmProjectId: string,
      scopeId: string,
      depth: number,
      availableTypes: JiraIssueType[],
      hasSyncableParent?: boolean,
      hasEpicKey?: boolean
    ): { id: string; name: string } | null {
      // 1. For synced items: use external_issue_type directly
      if (planItem.external_issue_type) {
        const matchingType = availableTypes.find(
          t => t.name.toLowerCase() === planItem.external_issue_type!.toLowerCase()
        );
        if (matchingType) {
          return { id: matchingType.id, name: matchingType.name };
        }
      }

      // 2. Try explicit mapping for label (for local items)
      if (planItem.label) {
        const mapping = TypeMappingRepository.getMapping(
          kpmProjectId,
          scopeId,
          planItem.label.toLowerCase()
        );
        if (mapping) {
          return { id: mapping.tracker_issue_type_id, name: mapping.tracker_issue_type_name };
        }
      }

      // 3. If item has a syncable parent, it should be a subtask
      // Use the subtask flag from Jira types (not name matching)
      if (hasSyncableParent) {
        const subtaskType = availableTypes.find(t => t.subtask);
        if (subtaskType) {
          return { id: subtaskType.id, name: subtaskType.name };
        }
      }

      // 4. Use depth-based fallback (shifted if epic is already set)
      const fallbackTable = hasEpicKey ? DEPTH_FALLBACK_WITH_EPIC : DEPTH_FALLBACK;
      const fallbackTypeName = fallbackTable[Math.min(depth, 4)];
      const fallbackType = availableTypes.find(
        t => t.name.toLowerCase() === fallbackTypeName.toLowerCase()
      );
      if (fallbackType) {
        return { id: fallbackType.id, name: fallbackType.name };
      }

      // 5. Last resort: use first non-subtask type
      const defaultType = availableTypes.find(t => !t.subtask);
      if (defaultType) {
        return { id: defaultType.id, name: defaultType.name };
      }

      return null;
    },

    /**
     * Validate that all labels in a set of items have mappings (or can use fallback).
     * Returns list of unmapped labels that have no fallback.
     */
    validateMappings(
      kpmProjectId: string,
      scopeId: string,
      labelsToValidate: string[]
    ): { valid: boolean; unmapped: string[] } {
      const unmapped: string[] = [];
      const mappings = TypeMappingRepository.getByProjectAndScope(kpmProjectId, scopeId);
      const mappedLabels = new Set(mappings.map(m => m.kpm_label.toLowerCase()));

      for (const label of labelsToValidate) {
        if (label && !mappedLabels.has(label.toLowerCase())) {
          unmapped.push(label);
        }
      }

      return {
        valid: unmapped.length === 0,
        unmapped,
      };
    },
  };
}

export type TypeMappingService = ReturnType<typeof createTypeMappingService>;
