import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Shared test utilities for e2e tests.
 * Uses behavioral selectors (getByRole, getByTestId, getByText) for refactor-resistance.
 */

/**
 * Creates a new project.
 */
export async function createProject(window: Page, name: string): Promise<void> {
  const projectNameInput = window.getByPlaceholder('My Feature');
  await projectNameInput.fill(name);
  await expect(window.getByText(name)).toBeVisible();
  await expect(window.getByTestId('canvas-viewport')).toBeVisible();
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

  // Wait for item to appear on canvas
  await expect(window.getByRole('article', { name: title })).toBeVisible();
}

/**
 * Creates a plan item via right-click context menu on the canvas.
 */
export async function createPlanItemViaContextMenu(
  window: Page,
  title: string,
  position: { x: number; y: number } = { x: 300, y: 200 }
): Promise<void> {
  const canvas = window.getByTestId('canvas-viewport');

  // Right-click on canvas to open context menu
  await canvas.click({ button: 'right', position });

  // Click "Create Item" in context menu
  await window.getByRole('menuitem', { name: 'Create Item' }).click();

  // Wait for modal to appear
  const titleInput = window.getByPlaceholder('What needs to be done?');
  await expect(titleInput).toBeVisible({ timeout: 5000 });

  // Fill title and submit
  await titleInput.fill(title);
  await titleInput.press('Enter');

  // Wait for item to appear on canvas
  await expect(window.getByRole('article', { name: title })).toBeVisible();
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
 * Switches to a specific view mode (Cards, Tree, or Board).
 */
export async function switchViewMode(window: Page, mode: 'Cards' | 'Tree' | 'Board'): Promise<void> {
}

/**
 * Switches to a main view (Plan or Develop).
 */
export async function switchMainView(window: Page, view: 'Plan' | 'Develop'): Promise<void> {
  await window.getByRole('button', { name: view }).click();
}

/**
 * Opens the status dropdown for a plan card and selects a status.
 * Uses ARIA roles for behavioral selection.
 */
export async function setItemStatus(
  window: Page,
  itemTitle: string,
  status: 'Not Started' | 'In Progress' | 'Done' | 'Blocked' | 'Canceled'
): Promise<void> {
  // Find the plan card by its accessible name
  const planCard = window.getByRole('article', { name: itemTitle });

  // Find the status button within the card (has aria-haspopup="listbox")
  const statusButton = planCard.locator('button[aria-haspopup="listbox"]');
  await statusButton.click();

  // Select the status option from the dropdown
  await window.getByRole('option', { name: status }).click();

  // Verify the status was updated - the button's aria-label should reflect the new status
  await expect(statusButton).toHaveAttribute('aria-label', `Status: ${status}`);
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
}

/**
 * Opens the edit modal for a plan item by clicking the Edit button on the card.
 */
export async function openItemEditPanel(window: Page, itemTitle: string): Promise<void> {
  const planCard = window.getByRole('article', { name: itemTitle });
  // Click the Edit item button within the card
  await planCard.getByRole('button', { name: 'Edit item' }).click();
  // Wait for the modal to appear
  await expect(window.getByText('Edit Task')).toBeVisible();
}

/**
 */
export async function openCardContextMenu(window: Page, itemTitle: string): Promise<void> {
  const planCard = window.getByRole('article', { name: itemTitle });
}

/**
 * Deletes a plan item via its context menu.
 */
export async function deletePlanItem(window: Page, itemTitle: string): Promise<void> {
  await openCardContextMenu(window, itemTitle);
  // Confirm deletion in the confirmation dialog
  // Verify item is gone
  await expect(window.getByRole('article', { name: itemTitle })).not.toBeVisible();
}

/**
 */
export async function reparentItem(
  window: Page,
  childTitle: string,
  parentTitle: string
): Promise<void> {
}
