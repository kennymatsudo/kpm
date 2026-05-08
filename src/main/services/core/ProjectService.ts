import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Project } from '../../../shared/types';
import type { IAppSettingsRepository, IProjectRepository } from '../../db/interfaces';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';

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

      try {
        const project = deps.projects.create({ name, folderPath });
        return success(project);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getDefaultLocation(): ServiceResult<{ defaultLocation: string }> {
      try {
        return success({
          defaultLocation: path.join(os.homedir(), 'Documents', 'KPM Projects'),
        });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    get(projectId: string): ServiceResult<Project | undefined> {
      try {
        return success(deps.projects.get(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    list(): ServiceResult<Project[]> {
      try {
        return success(deps.projects.list());
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    update(projectId: string, updates: ProjectUpdates): ServiceResult<Project | undefined> {
      try {
        deps.projects.update(projectId, updates);
        return success(deps.projects.get(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    delete(projectId: string): ServiceResult<void> {
      try {
        deps.projects.delete(projectId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
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
      try {
        deps.projects.updateStorybookUrl(projectId, storybookUrl);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
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
