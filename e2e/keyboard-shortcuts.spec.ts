import { test, expect } from './fixtures';
import {
  createProject,
  deleteProject,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Keyboard shortcuts', () => {
  const PROJECT_NAME = 'Shortcuts Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
  });

  test.afterAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    try {
      // Close any open modals/overlays that might block interaction
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const menuButton = page.getByRole('button', { name: `Project menu for ${PROJECT_NAME}` });
      if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteProject(page, PROJECT_NAME);
      }
    } catch {
      // Project may already be deleted
    }
  });

  test('keyboard shortcuts open in settings and close on escape', async ({ window }) => {
    await window.keyboard.press('Meta+,');
    await window.getByRole('tab', { name: 'Keyboard Shortcuts' }).click();

    await expect(window.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Global' })).toBeVisible();
    await expect(window.getByText('Toggle sidebar', { exact: true })).toBeVisible();
    await expect(window.getByText('Create plan item', { exact: true })).toBeVisible();
    await expect(window.getByText('Toggle terminal', { exact: true })).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.getByRole('dialog', { name: 'Settings' })).not.toBeVisible();
  });
});
