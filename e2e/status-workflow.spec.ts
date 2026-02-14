import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  setItemStatus,
  switchViewMode,
  expectItemCount,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Status workflow', () => {
  const PROJECT_NAME = 'Status Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
    await createPlanItem(page, 'Not Started Task');
    await createPlanItem(page, 'In Progress Task');
    await createPlanItem(page, 'Done Task');
  });

  test.afterAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    try {
      await switchViewMode(page, 'Cards');
      await deleteProject(page, PROJECT_NAME);
    } catch {
      // Cleanup best-effort
    }
  });

  test('change status Not Started to In Progress to Done', async ({ window }) => {
    await expectItemCount(window, 3);

    const planCard = window.getByRole('article', { name: 'Not Started Task' });
    await expect(planCard).toBeVisible();

    await setItemStatus(window, 'Not Started Task', 'In Progress');
    await expect(planCard.getByText('In Progress')).toBeVisible();

    await setItemStatus(window, 'Not Started Task', 'Done');
    await expect(planCard.getByText('Done')).toBeVisible();

    // Reset status for subsequent tests
    await setItemStatus(window, 'Not Started Task', 'Not Started');
  });

  test('status changes reflect in Board view', async ({ window }) => {
    await switchViewMode(window, 'Board');

    // Board view shows "3 items" header and status columns
    await expect(window.getByText('3 items')).toBeVisible({ timeout: 10000 });

    // Use exact matching to avoid matching item names like "Not Started Task"
    await expect(window.getByText('Not Started', { exact: true }).first()).toBeVisible();
    await expect(window.getByText('In Progress', { exact: true }).first()).toBeVisible();
    await expect(window.getByText('Done', { exact: true }).first()).toBeVisible();

    await expect(window.getByText('Not Started Task')).toBeVisible();
    await expect(window.getByText('In Progress Task')).toBeVisible();
    await expect(window.getByText('Done Task')).toBeVisible();

    await switchViewMode(window, 'Cards');
  });
});
