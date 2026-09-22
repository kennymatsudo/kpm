import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  reparentItem,
  expectItemCount,
  ensureAppReady,
  planCard,
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
      await deleteProject(page, PROJECT_NAME);
    } catch {
      // Cleanup best-effort
    }
  });

  test('reparenting nests a card under its parent', async ({ window }) => {
    await expectItemCount(window, 3);

    await reparentItem(window, 'Child Task 1', 'Parent Feature');

    // After reparenting, the parent card exposes a child-count toggle
    await expect(
      planCard(window, 'Parent Feature').getByRole('button', { name: '1 sub' })
    ).toBeVisible();
  });

  test('nesting goes more than one level deep', async ({ window }) => {
    // Reparent Child Task 2 under Child Task 1 for 3-level hierarchy:
    // Parent Feature > Child Task 1 > Child Task 2
    await reparentItem(window, 'Child Task 2', 'Child Task 1');

    // Nested cards start collapsed, so open the parent to reach the second level
    await planCard(window, 'Parent Feature').getByRole('button', { name: '1 sub' }).click();
    await expect(
      planCard(window, 'Child Task 1').getByRole('button', { name: '1 sub' })
    ).toBeVisible();
  });
});
