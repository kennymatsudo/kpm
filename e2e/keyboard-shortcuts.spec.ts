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

  test('shortcuts modal opens on button click and closes on escape', async ({ window }) => {
    await window.getByRole('button', { name: 'Show keyboard shortcuts' }).click();

    await expect(window.getByText('Keyboard Shortcuts')).toBeVisible();
    // Verify all 5 section headers are present (use heading role to avoid ambiguity)
    await expect(window.getByRole('heading', { name: 'Navigation' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Plan Items' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Views' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Chat' })).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.getByText('Keyboard Shortcuts')).not.toBeVisible();
  });
});
