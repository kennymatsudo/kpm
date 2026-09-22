import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  setItemStatus,
  setItemStatusInTree,
  switchViewMode,
  expectItemCount,
  ensureAppReady,
  treeRow,
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
    await setItemStatus(page, 'In Progress Task', 'In Progress');
    await setItemStatus(page, 'Done Task', 'Done');
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

  test('change status Not Started to In Progress to Done', async ({ window }) => {
    await expectItemCount(window, 3);
    await switchViewMode(window, 'Tree');

    await expect(treeRow(window, 'Not Started Task')).toBeVisible();

    await setItemStatusInTree(window, 'Not Started Task', 'In Progress');
    await setItemStatusInTree(window, 'Not Started Task', 'Done');

    // Reset status for subsequent tests
    await setItemStatusInTree(window, 'Not Started Task', 'Not Started');
    await switchViewMode(window, 'Board');
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
  });
});
