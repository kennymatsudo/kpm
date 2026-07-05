import type { ProjectService } from '../../services/core/ProjectService';
import { createRegistryIpcHandlers } from '../validation/utils';
import { projectEndpoints, type ProjectEndpointName } from '../../../shared/ipc/projectEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import { storybookEndpoints, type StorybookEndpointName } from '../../../shared/ipc/storybookEndpoints';

/**
 * One handler per `projectEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ProjectHandlers = { [K in ProjectEndpointName]: UnwrappedHandlerFor<typeof projectEndpoints, K> };

/**
 * One handler per `storybookEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type StorybookHandlers = { [K in StorybookEndpointName]: UnwrappedHandlerFor<typeof storybookEndpoints, K> };

function buildProjectHandlers(projectService: ProjectService): ProjectHandlers {
  return {
    create: async ({ name, folderPath }) => {
      const result = await projectService.create({ name, folderPath });
      if (!result.ok) throw new Error(result.error);
      return { project: result.data };
    },

    get: ({ projectId }) => {
      const result = projectService.get(projectId);
      if (!result.ok) throw new Error(result.error);
      return { project: result.data };
    },

    list: () => {
      const result = projectService.list();
      if (!result.ok) throw new Error(result.error);
      return { projects: result.data };
    },

    getDefaultLocation: () => {
      const result = projectService.getDefaultLocation();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },

    update: ({ projectId, updates }) => {
      const result = projectService.update(projectId, updates);
      if (!result.ok) throw new Error(result.error);
      return { project: result.data };
    },

    delete: ({ projectId }) => {
      const result = projectService.delete(projectId);
      if (!result.ok) throw new Error(result.error);
    },

    openFolder: async ({ projectId }) => {
      const result = await projectService.openFolder(projectId);
      if (!result.ok) throw new Error(result.error);
    },
  };
}

function buildStorybookHandlers(projectService: ProjectService): StorybookHandlers {
  return {
    updateUrl: ({ projectId, storybookUrl }) => {
      const result = projectService.updateStorybookUrl(projectId, storybookUrl);
      if (!result.ok) throw new Error(result.error);
    },

    testConnection: async ({ url }) => {
      const result = await projectService.testStorybookConnection(url);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  };
}

export function registerProjectHandlers(projectService: ProjectService): void {
  createRegistryIpcHandlers(projectEndpoints, buildProjectHandlers(projectService), 'Project operation failed');

  createRegistryIpcHandlers(storybookEndpoints, buildStorybookHandlers(projectService), 'Storybook operation failed');
}
