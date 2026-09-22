import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  createPlanItemInColumn,
  deleteProject,
  ensureAppReady,
  expectItemCount,
  planCard,
} from './test-utils';

test.describe.serial('Board card creation and context menu', () => {
  const PROJECT_NAME = 'Board Create Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
    await createPlanItem(page, 'Item A');
    await createPlanItem(page, 'Item B');
  });

  test.afterAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    try {
      const menuButton = page.getByRole('button', { name: `Project menu for ${PROJECT_NAME}` });
      if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteProject(page, PROJECT_NAME);
      }
    } catch {
      // Project may already be deleted
    }
  });

  test('create item via a column Add card button', async ({ window }) => {
    await createPlanItemInColumn(window, 'Item C', 'Not Started');
    await expectItemCount(window, 3);
  });

  test('card context menu closes on escape', async ({ window }) => {
    await planCard(window, 'Item A').click({ button: 'right' });

    const deleteButton = window.locator('.dropdown-item-danger');
    await expect(deleteButton).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(deleteButton).not.toBeVisible();
  });
});
