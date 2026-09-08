/**
 * Centralized cleanup for project-scoped stores.
 *
 * ADDING A NEW PROJECT-SCOPED STORE:
 * 1. Give your store a `resetProjectState()` method (clears project data,
 *    preserves any global settings such as a model preference)
 * 2. Import your store below
 * 3. Add it to PROJECT_SCOPED_STORES
 *
 * This is the SINGLE PLACE to manage project-scoped store cleanup.
 * All stores listed here are reset when switching projects to prevent memory leaks.
 * `PROJECT_SCOPED_STORES` is typed against a store exposing `resetProjectState`,
 * so registering one without it — or misspelling the method — is a compile error,
 * not a silent runtime no-op.
 *
 * NOTE: Only in-memory UI state is cleared. Database-persisted data remains
 * intact and is reloaded when opening each project.
 *
 * DELIBERATELY ABSENT: `permissionStore` and `activityStore`. Both exist to
 * describe work outside the open project — a request blocking a turn in the
 * project you just left, or what is still running there. Resetting them on
 * switch is exactly the bug they were added to fix.
 */

import type { StoreApi } from 'zustand';
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
import { useProposedChangeDisposal } from './proposedChangeDisposal';
import { useTerminalStore } from './terminalStore';
import { useLinearDocumentsStore } from './linearDocumentsStore';

interface ProjectScopedStore {
  name: string;
  store: StoreApi<{ resetProjectState: () => void }>;
}

/**
 * All stores that hold project-specific state and need cleanup on project switch.
 */
const PROJECT_SCOPED_STORES: ProjectScopedStore[] = [
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
  { name: 'linearDocuments', store: useLinearDocumentsStore },
  { name: 'proposedChanges', store: useProposedChangeDisposal },
  // Clears the tab list only. Main keeps the shells running, so switching back
  // re-lists them from there rather than respawning.
  { name: 'terminals', store: useTerminalStore },
];

/**
 * Reset all project-scoped stores.
 * Called by useProjectLoader when switching projects.
 */
export function resetAllProjectScopedStores(): void {
  for (const { name, store } of PROJECT_SCOPED_STORES) {
    try {
      store.getState().resetProjectState();
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
