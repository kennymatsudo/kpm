import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  setItemStatus,
  expectItemCount,
  ensureAppReady,
  planCard,
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
      await deleteProject(page, PROJECT_NAME);
    } catch {
      // Cleanup best-effort
    }
  });

  test('a status change moves the card to its new column', async ({ window }) => {
    await expectItemCount(window, 3);

    const column = (label: string) => window.getByRole('group', { name: new RegExp(`^${label},`) });
    await expect(column('Not Started').getByRole('group', { name: 'Not Started Task' })).toBeVisible();

    await setItemStatus(window, 'Not Started Task', 'Done');
    await expect(column('Done').getByRole('group', { name: 'Not Started Task' })).toBeVisible();

    // Reset status for subsequent tests
    await setItemStatus(window, 'Not Started Task', 'Not Started');
    await expect(planCard(window, 'Not Started Task')).toBeVisible();
  });

  test('every status category has a column', async ({ window }) => {
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
