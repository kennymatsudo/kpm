import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Project } from '../../../shared/types';
import type { IAppSettingsRepository, IProjectRepository } from '../../db/interfaces';
import { failure, success, wrap, type AsyncResult, type ServiceResult } from '../result';

type ProjectUpdates = Partial<Pick<Project, 'name' | 'phase'>>;

export interface CreateProjectInput {
  name: string;
  /**
   * Absolute path where the project folder lives. When omitted, the repository
   * falls back to its legacy `<userData>/projects/` location — used by tests
   * and any internal caller that doesn't care about the on-disk location.
   */
  folderPath?: string;
}

export interface ProjectServiceDeps {
  projects: IProjectRepository;
  appSettings: IAppSettingsRepository;
  openPath: (targetPath: string) => Promise<string>;
  fetchFn?: typeof fetch;
}

export function createProjectService(deps: ProjectServiceDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async create(input: CreateProjectInput): AsyncResult<Project> {
      const { name, folderPath } = input;

      if (folderPath !== undefined) {
        try {
          const stat = await fs.promises.stat(folderPath);
          if (!stat.isDirectory()) return failure(`${folderPath} is not a directory`);
        } catch {
          return failure(`${folderPath} does not exist`);
        }
      }

      return wrap(() => deps.projects.create({ name, folderPath }));
    },

    getDefaultLocation(): ServiceResult<{ defaultLocation: string }> {
      return wrap(() => ({
        defaultLocation: path.join(os.homedir(), 'Documents', 'KPM Projects'),
      }));
    },

    get(projectId: string): ServiceResult<Project | undefined> {
      return wrap(() => deps.projects.get(projectId));
    },

    list(): ServiceResult<Project[]> {
      return wrap(() => deps.projects.list());
    },

    update(projectId: string, updates: ProjectUpdates): ServiceResult<Project | undefined> {
      return wrap(() => {
        deps.projects.update(projectId, updates);
        return deps.projects.get(projectId);
      });
    },

    delete(projectId: string): ServiceResult<void> {
      return wrap(() => {
        deps.projects.delete(projectId);
      });
    },

    async openFolder(projectId: string): AsyncResult<void> {
      const project = deps.projects.get(projectId);
      if (!project) {
        return failure('Project not found');
      }

      try {
        const error = await deps.openPath(project.folder_path);
        return error ? failure(error) : success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    updateStorybookUrl(projectId: string, storybookUrl: string | null): ServiceResult<void> {
      return wrap(() => {
        deps.projects.updateStorybookUrl(projectId, storybookUrl);
      });
    },

    async testStorybookConnection(url: string): AsyncResult<{ componentCount: number }> {
      try {
        const indexUrl = `${url.replace(/\/$/, '')}/index.json`;
        const response = await fetchFn(indexUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          return failure(`Storybook returned ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { entries?: unknown; v?: number };
        if (!data.entries || typeof data.v !== 'number') {
          return failure('Response does not appear to be a valid Storybook index');
        }

        return success({ componentCount: Object.keys(data.entries).length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return failure(`Could not connect to Storybook: ${message}`);
      }
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
