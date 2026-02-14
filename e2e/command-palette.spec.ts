import { test, expect } from './fixtures';
import {
  createProject,
  deleteProject,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Command palette', () => {
  const PROJECT_NAME = 'Palette Test';

  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
    await createProject(page, PROJECT_NAME);
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

    await window.keyboard.press('Meta+k');

    const input = window.getByPlaceholder('Type a command or search...');
    await expect(input).toBeVisible({ timeout: 3000 });

    await expect(window.getByText('No commands found')).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(input).not.toBeVisible();
  });

  test('command palette closes on backdrop click', async ({ window }) => {
    await window.keyboard.press('Meta+k');

    const input = window.getByPlaceholder('Type a command or search...');
    await expect(input).toBeVisible({ timeout: 3000 });

    // Click the backdrop (top-left corner of the viewport, outside the palette)
    await window.mouse.click(10, 10);

    await expect(input).not.toBeVisible();
  });
});
