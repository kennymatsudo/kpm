
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
 */
const DEPTH_FALLBACK: Record<number, string> = {
  0: 'Epic',
  1: 'Story',
  2: 'Task',
  3: 'Task',
  4: 'Sub-task',
};

      );
      }
      }

