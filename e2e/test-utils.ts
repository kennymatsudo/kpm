import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Shared test utilities for e2e tests.
 * Uses behavioral selectors (getByRole, getByTestId, getByText) for refactor-resistance.
 */

/**
 * Creates a new project.
 * Works both from empty state (no projects) and when projects already exist.
 */
export async function createProject(window: Page, name: string): Promise<void> {
  // Check if the "New Project" button exists (no project state)
  const newProjectButton = window.getByTestId('new-project-button');
  if (await newProjectButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await newProjectButton.click();
  } else {
    // Use the project dropdown menu to create a new project
    const projectMenu = window.locator('button[aria-label^="Project menu for"]');
    await projectMenu.click();
    await window.getByRole('menuitem', { name: 'New Project' }).click();
  }

  const projectNameInput = window.getByPlaceholder('My Feature');
  await projectNameInput.fill(name);
  await window.getByRole('button', { name: 'Create project' }).click();
  await expect(window.getByText(name)).toBeVisible();
  // Navigate to the Execute view (app defaults to Workspace view)
  await window.getByRole('button', { name: 'Execute' }).click();
  // The Execute view is the board
  await expect(window.getByTestId('board-view')).toBeVisible();
}

/**
 * Locates a plan item's card in Board view by its title. Board cards expose an
 * accessible name of "[external key, ]title, status", and Playwright matches
 * role names by substring, so the title alone is enough.
 */
export function planCard(window: Page, title: string) {
  return window.getByRole('group', { name: title });
}

/**
 * Creates a plan item via the Create Item modal.
 * Uses keyboard shortcut Cmd+Shift+I to open the modal.
 */
export async function createPlanItem(window: Page, title: string): Promise<void> {
  // Use keyboard shortcut to open create item modal
  await window.keyboard.press('Meta+Shift+I');

  // Wait for modal to appear - look for the title input
  const titleInput = window.getByPlaceholder('What needs to be done?');
  await expect(titleInput).toBeVisible({ timeout: 5000 });

  // Fill title and submit
  await titleInput.fill(title);
  await titleInput.press('Enter');

  await expect(planCard(window, title)).toBeVisible();
}

/**
 * Creates a plan item via a board column's "Add card" button, which seeds the
 * modal with that column's status.
 */
export async function createPlanItemInColumn(
  window: Page,
  title: string,
  columnLabel: string
): Promise<void> {
  const column = window.getByRole('group', { name: new RegExp(`^${columnLabel},`) });
  await column.getByRole('button', { name: 'Add card' }).click();

  const titleInput = window.getByPlaceholder('What needs to be done?');
  await expect(titleInput).toBeVisible({ timeout: 5000 });

  await titleInput.fill(title);
  await titleInput.press('Enter');

  await expect(planCard(window, title)).toBeVisible();
}

/**
 * Creates a project with an initial plan item - common setup for most tests.
 */
export async function setupProjectWithItem(
  window: Page,
  projectName: string,
  itemTitle: string
): Promise<void> {
  await createProject(window, projectName);
  await createPlanItem(window, itemTitle);
}

/**
 * Deletes the current project via the project options menu.
 */
export async function deleteProject(window: Page, projectName?: string): Promise<void> {
  // Click project menu button in header - accessible name is "Project menu for {projectName}"
  const menuButton = projectName
    ? window.getByRole('button', { name: `Project menu for ${projectName}` })
    : window.locator('button[aria-label^="Project menu for"]');
  await menuButton.click();
  await window.getByRole('menuitem', { name: 'Delete Project' }).click();
  await window.getByRole('button', { name: 'Delete' }).click();
}

/**
 * Cleans up by deleting a project. Silently handles errors if project doesn't exist.
 */
export async function cleanupProject(window: Page, projectName: string): Promise<void> {
  try {
    const projectLink = window.getByText(projectName).first();
    if (await projectLink.isVisible({ timeout: 1000 })) {
      await deleteProject(window, projectName);
    }
  } catch {
    // Project doesn't exist or already deleted - that's fine
  }
}

/**
 * Switches to a different project via the TopBar dropdown → Open Project submenu.
 * The project list is in a nested submenu, not the sidebar.
 */
export async function switchToProject(window: Page, projectName: string): Promise<void> {
  // Open the project dropdown menu
  const projectMenuButton = window.locator('button[aria-label^="Project menu for"]');
  await projectMenuButton.click();

  // Hover over "Open Project" to reveal the submenu
  const openProjectItem = window.getByRole('menuitem', { name: 'Open Project' });
  await openProjectItem.hover();

  // Wait for submenu to appear and click the target project
  const projectItem = window.getByRole('menuitem', { name: projectName });
  await expect(projectItem).toBeVisible({ timeout: 3000 });
  await projectItem.click();

  // Wait for the project to load
  await window.waitForTimeout(500);
}

/**
 * Switches to a main view (Plan or Develop).
 */
export async function switchMainView(window: Page, view: 'Plan' | 'Develop'): Promise<void> {
  await window.getByRole('button', { name: view }).click();
}

export type StatusLabel = 'Not Started' | 'In Progress' | 'In Review' | 'Done' | 'Blocked' | 'Canceled';

const STATUS_CATEGORY_BY_LABEL: Record<StatusLabel, string> = {
  'Not Started': 'not_started',
  'In Progress': 'in_progress',
  'In Review': 'in_review',
  Done: 'done',
  Blocked: 'blocked',
  Canceled: 'canceled',
};

/**
 * Sets an item's status through the IPC API, then reloads so the store picks it
 * up. Board columns are the only status affordance in the UI and HTML5
 * drag-and-drop is unreliable here, so tests go through the API.
 */
export async function setItemStatus(
  window: Page,
  itemTitle: string,
  status: StatusLabel
): Promise<void> {
  await window.evaluate(async ({ title, statusCategory }) => {
    const w = window as unknown as { api: {
      projects: { list: () => Promise<{ id: string }[]> };
      plan: {
        listItems: (projectId: string) => Promise<{ id: string; title: string }[]>;
        executeActions: (
          projectId: string,
          actions: { type: string; item_id: string; updates: { status_category: string } }[]
        ) => Promise<unknown>;
      };
    } };

    const projects = await w.api.projects.list();
    if (projects.length === 0) throw new Error('No projects found');
    const projectId = projects[0].id;

    const items = await w.api.plan.listItems(projectId);
    const item = items.find((i) => i.title === title);
    if (!item) throw new Error(`Item "${title}" not found`);

    await w.api.plan.executeActions(projectId, [{
      type: 'update_item',
      item_id: item.id,
      updates: { status_category: statusCategory },
    }]);
  }, { title: itemTitle, statusCategory: STATUS_CATEGORY_BY_LABEL[status] });

  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await waitForAppReady(window);
  await window.getByRole('button', { name: 'Execute' }).click();
  await window.waitForTimeout(500);
}

/**
 * Asserts that the plan item count matches the expected value.
 * The UI shows counts in the Status button: "Status (N)" for N items, or just "Status" for 0 items.
 */
export async function expectItemCount(window: Page, count: number): Promise<void> {
  if (count === 0) {
    // When 0 items, button shows just "Status" without a count
    await expect(window.getByRole('button', { name: 'Status' })).toBeVisible();
  } else {
    // When N items, button shows "Status (N)"
    await expect(window.getByRole('button', { name: `Status (${count})` })).toBeVisible();
  }
}

/**
 * Gets the current plan item count from the toolbar.
 */
export async function getPlanItemCount(window: Page): Promise<number> {
  // Look for Status button with count
  const statusButton = window.locator('button:has-text("Status")');
  if (await statusButton.isVisible({ timeout: 1000 })) {
    const text = await statusButton.textContent();
    const match = text?.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  return 0;
}

/**
 * Waits for the app to be fully loaded and ready.
 */
export async function waitForAppReady(window: Page): Promise<void> {
  await window.waitForSelector('[data-testid="app-ready"]', { timeout: 10000, state: 'attached' });
}

/**
 * Resets the database via the testing API.
 * Only works when NODE_ENV=test.
 */
export async function resetDatabase(window: Page): Promise<void> {
  try {
    const resetResult = await window.evaluate(async () => {
      const api = (window as unknown as { api: { testing?: { resetDatabase: () => Promise<{ success: boolean; tablesReset?: number; error?: string }> } } }).api;
      if (api.testing) {
        return await api.testing.resetDatabase();
      }
      return { success: false, error: 'Testing API not available' };
    });
    if (resetResult.success) {
      console.log(`Database reset: ${String(resetResult.tablesReset)} tables truncated`);
    } else {
      console.warn('Database reset failed:', resetResult.error);
    }
  } catch (err) {
    console.warn('Database reset unavailable (not in test mode):', String(err));
  }
}

/**
 * Full app reset: clears the database, reloads the page, and waits for app
 * ready. Call this in beforeAll() for each spec file.
 */
export async function ensureAppReady(window: Page): Promise<void> {
  await resetDatabase(window);

  await window.reload();
  await window.waitForLoadState('domcontentloaded');

  await waitForAppReady(window);
}

/**
 * Opens the edit modal for a plan item by clicking the Edit button on the card.
 */
export async function openItemEditPanel(window: Page, itemTitle: string): Promise<void> {
  // Click the Edit item button within the card
  await planCard(window, itemTitle).getByRole('button', { name: 'Edit item' }).click();
  // Wait for the modal to appear
  await expect(window.getByText('Edit Task')).toBeVisible();
}

/** Opens the context menu for a plan card via right-click. */
export async function openCardContextMenu(window: Page, itemTitle: string): Promise<void> {
  await planCard(window, itemTitle).click({ button: 'right' });
  // Wait for the dropdown menu to appear — the Delete button is rendered
  // via portal with class 'dropdown-item-danger'
  await expect(window.locator('.dropdown-item-danger')).toBeVisible();
}

/**
 * Deletes a plan item via its context menu.
 */
export async function deletePlanItem(window: Page, itemTitle: string): Promise<void> {
  await openCardContextMenu(window, itemTitle);
  // Click the danger-styled Delete button in the portal dropdown menu
  await window.locator('.dropdown-item-danger').click();
  // Confirm deletion in the confirmation dialog
  const confirmButton = window.getByRole('button', { name: 'Delete this item permanently' });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  // Verify item is gone
  await expect(planCard(window, itemTitle)).not.toBeVisible();
}

/**
 * Reparents a plan item under another item using the IPC API directly,
 * then reloads the page to ensure the UI picks up the change.
 * This is more reliable than drag-and-drop which has flaky HTML5 DnD event handling.
 */
export async function reparentItem(
  window: Page,
  childTitle: string,
  parentTitle: string
): Promise<void> {
  await window.evaluate(async ({ child, parent }) => {
    const w = window as unknown as { api: {
      projects: {
        list: () => Promise<{ id: string }[]>;
      };
      plan: {
        listItems: (projectId: string) => Promise<{ id: string; title: string }[]>;
        executeActions: (projectId: string, actions: { type: string; item_id: string; new_parent_id: string | null }[]) => Promise<unknown>;
      };
    } };

    const projects = await w.api.projects.list();
    if (projects.length === 0) throw new Error('No projects found');
    const projectId = projects[0].id;

    const items = await w.api.plan.listItems(projectId);
    const childItem = items.find(i => i.title === child);
    const parentItem = items.find(i => i.title === parent);
    if (!childItem) throw new Error(`Child item "${child}" not found`);
    if (!parentItem) throw new Error(`Parent item "${parent}" not found`);

    await w.api.plan.executeActions(projectId, [{
      type: 'reparent',
      item_id: childItem.id,
      new_parent_id: parentItem.id,
    }]);
  }, { child: childTitle, parent: parentTitle });

  // Reload to ensure the Zustand store picks up the DB change
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await waitForAppReady(window);
  // Navigate to the Execute view since reload goes to the default view
  await window.getByRole('button', { name: 'Execute' }).click();
  await window.waitForTimeout(500);
}
