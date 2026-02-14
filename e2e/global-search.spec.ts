import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Global search', () => {
  const PROJECT_NAME = 'Search Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
    await createPlanItem(page, 'Auth Module');
    await createPlanItem(page, 'Payment API');
    await createPlanItem(page, 'Dashboard UI');
  });

  test.afterAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    try {
      // Close any open overlays that might block interaction
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

    await window.keyboard.press('Meta+Shift+f');

    const input = window.getByPlaceholder('Search tasks, docs...');
    await expect(input).toBeVisible({ timeout: 3000 });

    const searchOverlay = window.locator('[role="dialog"], .fixed').filter({
      has: window.getByPlaceholder('Search tasks, docs...'),
    });
    await expect(searchOverlay.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(searchOverlay.getByRole('button', { name: 'Tasks' })).toBeVisible();
    await expect(searchOverlay.getByRole('button', { name: 'Docs' })).toBeVisible();

    await input.fill('Auth');
    // Wait for debounce
    await window.waitForTimeout(400);

    // Scope to the search overlay to avoid matching the plan card behind it
    await expect(searchOverlay.getByText('Auth Module')).toBeVisible();
  });

  test('global search shows no results', async ({ window }) => {
    const input = window.getByPlaceholder('Search tasks, docs...');
    await input.clear();
    await input.fill('zzzznonexistent');
    // Wait for debounce
    await window.waitForTimeout(400);

    await expect(window.getByText('No results found')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(input).not.toBeVisible();
  });
});
