import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  setItemStatus,
  switchViewMode,
  switchMainView,
  switchToProject,
  ensureAppReady,
  planCard,
} from './test-utils';

test.describe.serial('Plan views and board interactions', () => {
  const PROJECT_NAME = 'Views Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
    await createPlanItem(page, 'Authentication Feature');
    await createPlanItem(page, 'Payment Integration');
    await createPlanItem(page, 'User Dashboard');
    await setItemStatus(page, 'Payment Integration', 'In Progress');
    await setItemStatus(page, 'User Dashboard', 'Done');
  });

  test.afterAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    try {
      await switchViewMode(page, 'Board');
      await deleteProject(page, PROJECT_NAME);
    } catch {
      // Cleanup best-effort
    }
  });

  test('switch between Tree and Board views', async ({ window }) => {
    const treeButton = window.locator('button[title="Tree view (outline)"]');
    const boardButton = window.locator('button[title="Board view (kanban)"]');

    await expect(treeButton).toBeVisible();
    await expect(boardButton).toBeVisible();

    // Switch to Tree view
    await switchViewMode(window, 'Tree');
    await expect(window.getByText('root items')).toBeVisible({ timeout: 10000 });

    // Switch back to Board view
    await switchViewMode(window, 'Board');
    await expect(window.getByText('3 items')).toBeVisible({ timeout: 10000 });
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
  });

  test('switch between Plan and Develop main views', async ({ window }) => {
    const planButton = window.getByRole('button', { name: 'Plan' });
    const developButton = window.getByRole('button', { name: 'Develop' });

    await expect(planButton).toBeVisible();
    await expect(developButton).toBeVisible();

    // Switch to Develop view
    await switchMainView(window, 'Develop');
    await expect(window.getByText('Sessions', { exact: true })).toBeVisible();

    // Switch back to Plan view
    await switchMainView(window, 'Plan');
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
  });

  test('view mode persists across project switch', async ({ window }) => {
    // Switch to Tree view
    await switchViewMode(window, 'Tree');
    await expect(window.getByText('root items')).toBeVisible({ timeout: 10000 });

    // Create a second project
    await createProject(window, 'Second Project');

    // New project should start in Board view (default)
    await expect(window.getByText('0 items')).toBeVisible();

    // Switch back to first project via TopBar menu
    await switchToProject(window, PROJECT_NAME);

    // Should still be in Tree view (persisted) — navigate to Plan view first
    await window.getByRole('button', { name: 'Plan' }).click();
    await expect(window.getByText('root items')).toBeVisible({ timeout: 10000 });

    // Clean up second project
    await switchToProject(window, 'Second Project');
    await deleteProject(window);

    // After deleting, should auto-switch to remaining project
    // Navigate to Plan view and reset to Board
    await window.getByRole('button', { name: 'Plan' }).click();
    await window.waitForTimeout(500);
    await switchViewMode(window, 'Board');
    await expect(window.getByTestId('board-view')).toBeVisible({ timeout: 10000 });
  });

  test('search input filters items', async ({ window }) => {
    const searchInput = window.getByPlaceholder('Search items...');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Auth');
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();

    await searchInput.clear();
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
    await expect(planCard(window, 'Payment Integration')).toBeVisible();
    await expect(planCard(window, 'User Dashboard')).toBeVisible();
  });

  test('search works in tree view', async ({ window }) => {
    await switchViewMode(window, 'Tree');

    const searchInput = window.getByPlaceholder('Search items...');
    await searchInput.fill('Payment');
    await expect(window.getByText('Payment Integration')).toBeVisible();

    await searchInput.clear();
    await switchViewMode(window, 'Board');
  });

  test('search clear button works', async ({ window }) => {
    const searchInput = window.getByPlaceholder('Search items...');
    await searchInput.fill('test query');
    await expect(searchInput).toHaveValue('test query');

    const clearButton = searchInput.locator('..').locator('button');
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await expect(searchInput).toHaveValue('');
    } else {
      await searchInput.clear();
    }
  });

  test('status filter toggles visibility', async ({ window }) => {
    // All items visible initially
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
    await expect(planCard(window, 'Payment Integration')).toBeVisible();
    await expect(planCard(window, 'User Dashboard')).toBeVisible();

    // Filter out Done status — use the Status toolbar button (not card status buttons)
    const statusFilterButton = window.getByRole('button', { name: 'Status (3)' });
    await statusFilterButton.click();

    // The status dropdown is rendered via portal — use last() to avoid matching card status text
    const doneCheckbox = window.getByText('Done').last();
    await doneCheckbox.click();
    await window.keyboard.press('Escape');

    // Done item should be hidden
    await expect(planCard(window, 'User Dashboard')).not.toBeVisible();
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
    await expect(planCard(window, 'Payment Integration')).toBeVisible();

    // Re-enable Done status — button now shows filtered count
    const statusFilterButtonFiltered = window.getByRole('button', { name: /Status.*2\/3/ });
    await statusFilterButtonFiltered.click();
    const doneCheckbox2 = window.getByText('Done').last();
    await doneCheckbox2.click();
    await window.keyboard.press('Escape');

    await expect(planCard(window, 'User Dashboard')).toBeVisible();
  });
});
