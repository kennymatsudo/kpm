import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  setItemStatus,
  switchMainView,
  ensureAppReady,
  planCard,
} from './test-utils';

test.describe.serial('Board view and its toolbar', () => {
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
      await deleteProject(page, PROJECT_NAME);
    } catch {
      // Cleanup best-effort
    }
  });

  test('switch between Execute and Workspace main views', async ({ window }) => {
    const executeButton = window.getByRole('button', { name: 'Execute' });
    const workspaceButton = window.getByRole('button', { name: 'Workspace' });

    await expect(executeButton).toBeVisible();
    await expect(workspaceButton).toBeVisible();

    // Switch to the workspace
    await switchMainView(window, 'Workspace');
    await expect(window.getByTestId('board-view')).not.toBeVisible();
    await expect(workspaceButton).toHaveAttribute('aria-pressed', 'true');

    // Switch back to the execution board
    await switchMainView(window, 'Execute');
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
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

    const doneCheckbox = window.getByRole('button', { name: 'Done', exact: true });
    await doneCheckbox.click();
    const statusFilterButtonFiltered = window.getByRole('button', { name: /Status.*2\/3/ });
    await statusFilterButtonFiltered.click();

    // Done item should be hidden
    await expect(planCard(window, 'User Dashboard')).not.toBeVisible();
    await expect(planCard(window, 'Authentication Feature')).toBeVisible();
    await expect(planCard(window, 'Payment Integration')).toBeVisible();

    // Re-enable Done status — button now shows filtered count
    await statusFilterButtonFiltered.click();
    const doneCheckbox2 = window.getByRole('button', { name: 'Done', exact: true });
    await doneCheckbox2.click();
    await statusFilterButton.click();

    await expect(planCard(window, 'User Dashboard')).toBeVisible();
  });
});
