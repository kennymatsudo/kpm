/**
 * Centralized cleanup for project-scoped stores.
 *
 * ADDING A NEW PROJECT-SCOPED STORE:
 * 1. Ensure your store has a `resetProjectState()` method
 * 2. Import your store below
 * 3. Add it to PROJECT_SCOPED_STORES
 *
 * This is the SINGLE PLACE to manage project-scoped store cleanup.
 * All stores listed here are reset when switching projects to prevent memory leaks.
 *
 * RESET METHODS:
 * - `reset()` - Full reset to initial state. Used by TESTS only.
 * - `resetProjectState()` - Clears project data but preserves global settings
 *   (e.g., model preference). Used at RUNTIME when switching projects.
 *
 * For stores without global settings, `resetProjectState()` can just call `reset()`.
 *
 * NOTE: Only in-memory UI state is cleared. Database-persisted data remains
 * intact and is reloaded when opening each project.
 */

import { useChatStore } from './chat';
import { useTrackerStore } from './trackerStore';
import { useFileTreeStore } from './fileTreeStore';
import { useExportStore } from './tracker/useExportStore';
import { useTrackerConfigStore } from './tracker/useConfigStore';
import { useSyncStore } from './tracker/useSyncStore';
import { useSyncReviewStore } from './tracker/useSyncReviewStore';
import { useGroupStore } from './groupStore';
import { useDevSessionsStore } from './devSessions';
import { useWorkspaceStore } from './workspaceStore';
import { useProjectStore } from './projectStore';
import { useTaskPromptTemplateStore } from './taskPromptTemplateStore';
import { useToolPermissionStore } from './toolPermissionStore';
import { useApprovalQueueStore } from './approvalQueueStore';

interface AnyStore { getState: () => unknown }

interface StoreEntry {
  name: string;
  store: AnyStore;
}

/**
 * All stores that hold project-specific state and need cleanup on project switch.
 * Each store must have a `resetProjectState()` method.
 */
const PROJECT_SCOPED_STORES: StoreEntry[] = [
  { name: 'chat', store: useChatStore },
  { name: 'tracker', store: useTrackerStore },
  { name: 'export', store: useExportStore },
  { name: 'trackerConfig', store: useTrackerConfigStore },
  { name: 'sync', store: useSyncStore },
  { name: 'syncReview', store: useSyncReviewStore },
  { name: 'fileTree', store: useFileTreeStore },
  { name: 'groups', store: useGroupStore },
  { name: 'devSessions', store: useDevSessionsStore },
  { name: 'workspace', store: useWorkspaceStore },
  { name: 'project', store: useProjectStore },
  { name: 'taskPromptTemplates', store: useTaskPromptTemplateStore },
  { name: 'toolPermissions', store: useToolPermissionStore },
  { name: 'approvalQueue', store: useApprovalQueueStore },
];

/**
 * Reset all project-scoped stores.
 * Called by useProjectLoader when switching projects.
 */
export function resetAllProjectScopedStores(): void {
  for (const { name, store } of PROJECT_SCOPED_STORES) {
    try {
      const state = store.getState() as Record<string, unknown>;
      if (typeof state.resetProjectState === 'function') {
        (state.resetProjectState as () => void)();
      } else if (typeof state.reset === 'function') {
        // Fallback for stores without global state
        (state.reset as () => void)();
      } else {
        console.warn(`[ProjectScopedStores] ${name} missing resetProjectState()`);
      }
    } catch (error) {
      console.error(`[ProjectScopedStores] Failed to reset ${name}:`, error);
    }
  }
}

/**
 * Get list of registered stores (for debugging).
 */
export function getRegisteredStoreNames(): string[] {
  return PROJECT_SCOPED_STORES.map((s) => s.name);
}
