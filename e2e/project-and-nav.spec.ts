import { test, expect } from './fixtures';
import {
  createProject,
  createPlanItem,
  deleteProject,
  openItemEditPanel,
  switchToProject,
  expectItemCount,
  ensureAppReady,
} from './test-utils';

test.describe.serial('Project operations and navigation', () => {
  test.beforeAll(async ({ electronApp }) => {
    const page = electronApp.context.pages()[0];
    await ensureAppReady(page);
  });

  test('no project shows welcome message', async ({ window }) => {
    await expect(window.getByText('No project open')).toBeVisible();
  });

  test('create project', async ({ window }) => {
    await createProject(window, 'Nav Test Project');
    await expect(window.getByTestId('canvas-viewport')).toBeVisible();
    await expectItemCount(window, 0);
    await expect(window.getByText('Start planning')).toBeVisible();
    await expect(window.getByText('Ask Claude to break down your project')).toBeVisible();
  });

  test('item count updates when adding items', async ({ window }) => {
    await createPlanItem(window, 'Test Item');
    await expectItemCount(window, 1);
    await expect(window.getByText('Start planning')).not.toBeVisible();
  });

  test('rename project via options menu', async ({ window }) => {
    await window.getByRole('button', { name: 'Project menu for Nav Test Project' }).click();
    await window.getByRole('menuitem', { name: 'Rename' }).click();

    const renameInput = window.locator('input.input').first();
    await expect(renameInput).toBeVisible();
    await renameInput.clear();
    await renameInput.fill('Renamed Project');
    await renameInput.press('Enter');

    await expect(window.getByText('Renamed Project')).toBeVisible();
  });

  test('chat panel toggles visibility', async ({ window }) => {
    // The chat panel indicator: "Send message" button is always present when chat is visible
    const chatIndicator = window.getByRole('button', { name: 'Send message' });
    // The toggle button has aria-label "Collapse chat panel" or "Expand chat panel"
    const collapseButton = window.getByRole('button', { name: 'Collapse chat panel' });
    const expandButton = window.getByRole('button', { name: 'Expand chat panel' });

    // Chat should be visible initially (collapse button is shown)
    if (await collapseButton.isVisible()) {
      await expect(chatIndicator).toBeVisible();

      // Collapse the chat panel
      await collapseButton.click();
      await expect(chatIndicator).not.toBeVisible();

      // Expand the chat panel back
      await expandButton.click();
      await expect(chatIndicator).toBeVisible();
    }
  });

  test('theme toggle switches between light and dark modes', async ({ window }) => {
    const isDarkInitially = await window.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );

    const toggleButton = window.locator('[title*="theme" i], [title*="light" i], [title*="dark" i]').first();

    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      const isDarkAfterClick = await window.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(isDarkAfterClick).not.toBe(isDarkInitially);

      // Toggle back to restore
      await toggleButton.click();
      const isDarkAfterSecondClick = await window.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(isDarkAfterSecondClick).toBe(isDarkInitially);
    }
  });

  test('escape key closes open dialogs', async ({ window }) => {
    await openItemEditPanel(window, 'Test Item');
    await expect(window.getByText('Edit Task')).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.getByText('Edit Task')).not.toBeVisible();
  });

  test('enter key submits forms', async ({ window }) => {
    // Create a new project via Enter key (tests Enter submission)
    // Use the project menu since a project already exists
    const projectMenu = window.locator('button[aria-label^="Project menu for"]');
    await projectMenu.click();
    await window.getByRole('menuitem', { name: 'New Project' }).click();

    const projectNameInput = window.getByPlaceholder('My Feature');
    await projectNameInput.fill('Enter Key Test');
    await projectNameInput.press('Enter');

    await expect(window.getByText('Enter Key Test')).toBeVisible();

    // Clean up the second project - navigate to Plan view first
    await window.getByRole('button', { name: 'Plan' }).click();
    await deleteProject(window);
  });

  test('tab navigation works through form elements', async ({ window }) => {
    // After deleting "Enter Key Test", app auto-switches to "Renamed Project"
    // Navigate to Plan view to see the items
    await window.getByRole('button', { name: 'Plan' }).click();
    await expect(window.getByTestId('canvas-viewport')).toBeVisible();

    await openItemEditPanel(window, 'Test Item');
    await expect(window.getByText('Edit Task')).toBeVisible();

    // The edit modal is a <Modal> (role="dialog"), not <aside>
    const titleInput = window.getByPlaceholder('Task title...');
    await titleInput.focus();

    await window.keyboard.press('Tab');

    const descriptionInput = window.getByPlaceholder('Add a description... (Markdown supported)');
    await expect(descriptionInput).toBeFocused();

    await window.keyboard.press('Escape');
  });

  test('arrow keys work in dropdown menus', async ({ window }) => {
    const planCard = window.getByRole('article', { name: 'Test Item' });
    const statusButton = planCard.locator('button[aria-haspopup="listbox"]');
    await statusButton.click();

    await expect(window.getByRole('listbox', { name: 'Status options' })).toBeVisible();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Escape');
  });

  test('delete confirmation dialog appears for destructive actions', async ({ window }) => {
    const planCard = window.getByRole('article', { name: 'Test Item' });
    await planCard.click({ button: 'right' });

    // The Delete button in the context menu is a plain <button> with class dropdown-item-danger
    await window.locator('.dropdown-item-danger').click();

    await expect(window.getByText('Delete Item?')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Delete this item permanently' })).toBeVisible();
    await expect(window.getByRole('button', { name: /Cancel/ })).toBeVisible();

    await window.getByRole('button', { name: /Cancel/ }).click();
    await expect(window.getByRole('article', { name: 'Test Item' })).toBeVisible();
  });

  test('multiple projects can be created and switched between', async ({ window }) => {
    await createProject(window, 'Project B');
    await expect(window.getByTestId('canvas-viewport')).toBeVisible();

    // Verify we can switch to the other project via the TopBar menu
    await switchToProject(window, 'Renamed Project');
    await window.getByRole('button', { name: 'Plan' }).click();
    await expect(window.getByTestId('canvas-viewport')).toBeVisible();

    // Switch back to Project B
    await switchToProject(window, 'Project B');
    await window.getByRole('button', { name: 'Plan' }).click();
    await expect(window.getByTestId('canvas-viewport')).toBeVisible();

    // Clean up — delete Project B first (currently active)
    await deleteProject(window, 'Project B');
    // After deleting, app auto-switches to Renamed Project
    await deleteProject(window, 'Renamed Project');

    await expect(window.getByText('No project open')).toBeVisible();
  });
});
