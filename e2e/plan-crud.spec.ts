import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deletePlanItem,
  deleteProject,
  openItemEditPanel,
  expectItemCount,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Plan CRUD operations', () => {
  const PROJECT_NAME = 'CRUD Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
  });

  test.afterAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    try {
      // Only try to delete if the project menu button exists
      const menuButton = page.getByRole('button', { name: `Project menu for ${PROJECT_NAME}` });
      if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteProject(page, PROJECT_NAME);
      }
    } catch {
      // Project may already be deleted
    }
  });

  test('create item via keyboard shortcut', async ({ window }) => {
    await createPlanItem(window, 'First Feature');
    await expect(window.getByRole('article', { name: 'First Feature' })).toBeVisible();
    await expectItemCount(window, 1);
  });

  test('create multiple items', async ({ window }) => {
    await createPlanItem(window, 'Second Task');
    await expectItemCount(window, 2);

    await createPlanItem(window, 'Third Task');
    await expectItemCount(window, 3);

    await expect(window.getByRole('article', { name: 'First Feature' })).toBeVisible();
    await expect(window.getByRole('article', { name: 'Second Task' })).toBeVisible();
    await expect(window.getByRole('article', { name: 'Third Task' })).toBeVisible();
  });

  test('edit item title and description with persistence', async ({ window }) => {

    const titleInput = window.getByPlaceholder('Task title...');

    await titleInput.clear();
    await titleInput.fill('Updated Feature');

    const descriptionInput = window.getByPlaceholder('Add a description... (Markdown supported)');
    await descriptionInput.fill('This is a test description for the item.');

    await window.getByRole('button', { name: 'Save Changes' }).click();

    await expect(window.getByRole('article', { name: 'Updated Feature' })).toBeVisible();
    await expect(window.getByText('Edit Task')).not.toBeVisible();

    // Re-open to verify description persisted
    await openItemEditPanel(window, 'Updated Feature');
    const descriptionInput2 = window.getByPlaceholder('Add a description... (Markdown supported)');
    await expect(descriptionInput2).toHaveValue('This is a test description for the item.');
    await window.getByRole('button', { name: 'Close' }).click();
  });

  test('unsaved changes dialog - keep editing', async ({ window }) => {
    await openItemEditPanel(window, 'Updated Feature');

    const titleInput = window.getByPlaceholder('Task title...');
    await titleInput.clear();
    await titleInput.fill('Modified Title');

    await window.getByRole('button', { name: 'Close' }).click();

    await expect(window.getByText('Discard changes?')).toBeVisible();
    await window.getByRole('button', { name: 'Cancel and keep items' }).click();

    await expect(window.getByText('Discard changes?')).not.toBeVisible();
    await expect(window.getByPlaceholder('Task title...')).toHaveValue('Modified Title');

    // Save the changes so state is clean for next test
    await window.getByRole('button', { name: 'Save Changes' }).click();
    await expect(window.getByRole('article', { name: 'Modified Title' })).toBeVisible();
  });

  test('unsaved changes dialog - discard', async ({ window }) => {
    await openItemEditPanel(window, 'Modified Title');

    const titleInput = window.getByPlaceholder('Task title...');
    await titleInput.clear();
    await titleInput.fill('This Should Be Discarded');

    await window.getByRole('button', { name: 'Close' }).click();

    await expect(window.getByText('Discard changes?')).toBeVisible();
    await window.getByRole('button', { name: 'Discard' }).click();

    await expect(window.getByText('Edit Task')).not.toBeVisible();
    await expect(window.getByRole('article', { name: 'Modified Title' })).toBeVisible();
  });

  test('delete item updates count', async ({ window }) => {
    await deletePlanItem(window, 'Third Task');
    await expectItemCount(window, 2);
  });

  test('delete project returns to empty state', async ({ window }) => {
    await deleteProject(window, PROJECT_NAME);
    await expect(window.getByText('No project open')).toBeVisible();

    // Re-create project so afterAll doesn't error trying to delete
    // Actually just let afterAll catch the error - project is already gone
  });
});
