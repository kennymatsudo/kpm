import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { emitAppEvent, type EventDefinition, type EventPayload } from '../../shared/ipc/appEvents';
import { menuEvents } from '../../shared/ipc/menuEvents';

interface RecentProject {
  id: string;
  name: string;
}

export interface ApplicationMenuDeps {
  getMainWindow: () => BrowserWindow | null;
  getRecentProjects: () => RecentProject[];
}

export function buildApplicationMenu(deps: ApplicationMenuDeps): void {
  const isMac = process.platform === 'darwin';
  const recentProjects = deps.getRecentProjects();
  const recentProjectsSubmenu: MenuItemConstructorOptions[] = recentProjects.slice(0, 10).map((project) => ({
    label: project.name,
    click: () => {
      const win = BrowserWindow.getFocusedWindow() || deps.getMainWindow();
      emitAppEvent(win?.webContents, menuEvents.openProject, { projectId: project.id });
    },
  }));

  if (recentProjectsSubmenu.length === 0) {
    recentProjectsSubmenu.push({ label: 'No recent projects', enabled: false });
  }

  function sendToFocusedOrMainWindow<E extends EventDefinition>(event: E, payload?: EventPayload<E>): void {
    const win = BrowserWindow.getFocusedWindow() || deps.getMainWindow();
    emitAppEvent(win?.webContents, event, payload!);
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'KPM',
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ] as MenuItemConstructorOptions[],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          click: () => sendToFocusedOrMainWindow(menuEvents.newProject),
        },
        { type: 'separator' as const },
        {
          label: 'Open Recent',
          submenu: recentProjectsSubmenu,
        },
        { type: 'separator' as const },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendToFocusedOrMainWindow(menuEvents.closeContext),
        },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'pasteAndMatchStyle' as const },
        { role: 'delete' as const },
        { role: 'selectAll' as const },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        { type: 'separator' as const },
        { role: 'front' as const },
      ] as MenuItemConstructorOptions[],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
