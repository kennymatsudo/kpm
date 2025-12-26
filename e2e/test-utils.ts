import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Shared test utilities for e2e tests.
 */

/**
 */
export async function createProject(window: Page, name: string): Promise<void> {
  await projectNameInput.fill(name);
  await expect(window.getByText(name)).toBeVisible();
}

/**
 */


}

/**
 */
}

/**
 */
  window: Page,
): Promise<void> {
}

/**
 * Deletes the current project via the project options menu.
 */
export async function deleteProject(window: Page, projectName?: string): Promise<void> {
  // Click project menu button in header - accessible name is "Project menu for {projectName}"
  const menuButton = projectName
    ? window.getByRole('button', { name: `Project menu for ${projectName}` })
  await menuButton.click();
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
 */
export async function setItemStatus(
  window: Page,
  itemTitle: string,
): Promise<void> {

}

/**
 */
}

/**
 * Gets the current plan item count from the toolbar.
 */
export async function getPlanItemCount(window: Page): Promise<number> {
    return match ? parseInt(match[1], 10) : 0;
  }
  return 0;
}

/**
 * Waits for the app to be fully loaded and ready.
 */
export async function waitForAppReady(window: Page): Promise<void> {
