import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  switchViewMode,
  reparentItem,
  expectItemCount,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Plan hierarchy workflow', () => {
  const PROJECT_NAME = 'Hierarchy Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
    await createPlanItem(page, 'Parent Feature');
    await createPlanItem(page, 'Child Task 1');
    await createPlanItem(page, 'Child Task 2');
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

  test('drag-drop creates parent-child hierarchy', async ({ window }) => {
    await expectItemCount(window, 3);

    await reparentItem(window, 'Child Task 1', 'Parent Feature');

    // After reparenting, the parent card shows a child count indicator
    const parentCard = window.getByRole('article', { name: 'Parent Feature' }).first();
    await expect(parentCard.getByText('(1)')).toBeVisible();
  });

  test('tree view shows hierarchy', async ({ window }) => {
    await switchViewMode(window, 'Tree');

    await expect(window.getByText('Parent Feature')).toBeVisible();
    await expect(window.getByText('Child Task 1')).toBeVisible();
    await expect(window.getByText('Child Task 2')).toBeVisible();

    await switchViewMode(window, 'Cards');
  });

  test('drag-drop creates multi-level nesting', async ({ window }) => {
    // Reparent Child Task 2 under Child Task 1 for 3-level hierarchy:
    // Parent Feature > Child Task 1 > Child Task 2
    await reparentItem(window, 'Child Task 2', 'Child Task 1');

    await switchViewMode(window, 'Tree');

    await expect(window.getByText('Parent Feature')).toBeVisible();
    await expect(window.getByText('Child Task 1')).toBeVisible();
    await expect(window.getByText('Child Task 2')).toBeVisible();

    await switchViewMode(window, 'Cards');
  });
});
