import { ipcMain } from 'electron';
import type { ProjectService } from '../../services/core/ProjectService';
import { createIpcHandler, createSimpleIpcHandler, ProjectSchemas, StorybookSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerProjectHandlers(projectService: ProjectService): void {
  ipcMain.handle(
    IPC_CHANNELS.project.create,
    createIpcHandler(
      ProjectSchemas.create,
      async ({ name, folderPath }) => {
        const result = await projectService.create({ name, folderPath });
        if (!result.ok) throw new Error(result.error);
        return { project: result.data };
      },
      'Failed to create project',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.project.get,
    createIpcHandler(
      ProjectSchemas.get,
      ({ projectId }) => {
        const result = projectService.get(projectId);
        if (!result.ok) throw new Error(result.error);
        return { project: result.data };
      },
      'Failed to get project',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.project.list,
    createSimpleIpcHandler(() => {
      const result = projectService.list();
      if (!result.ok) throw new Error(result.error);
      return { projects: result.data };
    }, 'Failed to list projects'),
  );

  ipcMain.handle(
    IPC_CHANNELS.project.getDefaultLocation,
    createSimpleIpcHandler(() => {
      const result = projectService.getDefaultLocation();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    }, 'Failed to resolve default project location'),
  );

  ipcMain.handle(
    IPC_CHANNELS.project.update,
    createIpcHandler(
      ProjectSchemas.update,
      ({ projectId, updates }) => {
        const result = projectService.update(projectId, updates);
        if (!result.ok) throw new Error(result.error);
        return { project: result.data };
      },
      'Failed to update project',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.project.delete,
    createIpcHandler(
      ProjectSchemas.delete,
      ({ projectId }) => {
        const result = projectService.delete(projectId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to delete project',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.project.openFolder,
    createIpcHandler(
      ProjectSchemas.openFolder,
      async ({ projectId }) => {
        const result = await projectService.openFolder(projectId);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to open project folder',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.storybook.updateUrl,
    createIpcHandler(
      StorybookSchemas.updateUrl,
      ({ projectId, storybookUrl }) => {
        const result = projectService.updateStorybookUrl(projectId, storybookUrl);
        if (!result.ok) throw new Error(result.error);
      },
      'Failed to update Storybook URL',
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.storybook.testConnection,
    createIpcHandler(
      StorybookSchemas.testConnection,
      async ({ url }) => {
        const result = await projectService.testStorybookConnection(url);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      'Failed to test Storybook connection',
    ),
  );
}
