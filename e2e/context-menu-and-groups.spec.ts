import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  createPlanItemViaContextMenu,
  deleteProject,
  ensureAppReady,
  expectItemCount,
  createGroupOnCanvas,
} from './test-utils';

test.describe.serial('Context menu and groups', () => {
  const PROJECT_NAME = 'Groups Test';

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

  test('create item via context menu', async ({ window }) => {
    // Use a position below the existing cards but well within the canvas
    await createPlanItemViaContextMenu(window, 'Item C', { x: 300, y: 450 });
    await expectItemCount(window, 3);
  });

  test('create group via context menu', async ({ window }) => {
    await createGroupOnCanvas(window, { x: 600, y: 400 });
    await expect(window.locator('[data-group-container]')).toBeVisible();
    await expect(window.getByText('New Group')).toBeVisible();
  });

  test('rename group', async ({ window }) => {
    const group = window.locator('[data-group-container]');
    await group.locator('[title="Edit name"]').click();

    const nameInput = group.locator('input');
    await nameInput.clear();
    await nameInput.fill('Sprint 1');
    await nameInput.press('Enter');

    await expect(window.getByText('Sprint 1')).toBeVisible();
  });

  test('collapse and expand group', async ({ window }) => {
    const group = window.locator('[data-group-container]');

    // Collapse
    await group.locator('[title="Collapse group"]').click();
    await expect(group.locator('[title="Expand group"]')).toBeVisible();

    // Expand
    await group.locator('[title="Expand group"]').click();
    await expect(group.locator('[title="Collapse group"]')).toBeVisible();
  });

  test('delete group', async ({ window }) => {
    const group = window.locator('[data-group-container]');
    await group.locator('[title="Delete group"]').click();

    await expect(window.locator('[data-group-container]')).not.toBeVisible();
  });

  test('context menu closes on escape', async ({ window }) => {
    const canvas = window.getByTestId('canvas-viewport');
    await canvas.click({ button: 'right', position: { x: 500, y: 400 } });

    const menuItem = window.getByRole('menuitem', { name: 'Create Item' });
    await expect(menuItem).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(menuItem).not.toBeVisible();
  });
});
