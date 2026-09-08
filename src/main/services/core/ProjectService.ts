import fs from 'fs';
import type { Stats } from 'fs';
import type { FolderInspection, Project } from '../../../shared/types';
import type { IAppSettingsRepository, IProjectRepository } from '../../db/interfaces';
import { projectsRootPath } from '../../project-context/projectFolder';
import { expandTilde } from '../files/pathSecurity';
import { failure, success, wrap, type AsyncResult, type ServiceResult } from '../result';

type ProjectUpdates = Partial<Pick<Project, 'name' | 'phase'>>;

/** `stat` without the throw: `null` means nothing exists at that path. */
async function statOrNull(targetPath: string): Promise<Stats | null> {
  try {
    return await fs.promises.stat(targetPath);
  } catch {
    return null;
  }
}

export interface CreateProjectInput {
  name: string;
  /**
   * Where the project folder lives. Accepts a `~`-relative path. The folder is
   * created if it doesn't exist yet, so this can name a folder the user only
   * intends. When omitted, the project lands in the KPM-managed
   * `<userData>/projects/` location reported by `getDefaultLocation`.
   */
  folderPath?: string;
}

export interface ProjectServiceDeps {
  projects: IProjectRepository;
  appSettings: IAppSettingsRepository;
  /** Electron's userData directory — the root of KPM-managed project folders. */
  userDataPath: string;
  openPath: (targetPath: string) => Promise<string>;
  fetchFn?: typeof fetch;
}

export function createProjectService(deps: ProjectServiceDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async create(input: CreateProjectInput): AsyncResult<Project> {
      const { name } = input;
      const folderPath = input.folderPath === undefined ? undefined : expandTilde(input.folderPath);

      // A missing folder is not an error: the repository mkdirs it, so the user
      // can name a folder they only intend. An existing *file* still can't host
      // a project, and silently creating the folder next to it would surprise.
      if (folderPath !== undefined) {
        const stat = await statOrNull(folderPath);
        if (stat && !stat.isDirectory()) return failure(`${folderPath} is not a folder`);
      }

      return wrap(() => deps.projects.create({ name, folderPath }));
    },

    async inspectFolder(folderPath: string): AsyncResult<FolderInspection> {
      const resolvedPath = expandTilde(folderPath);
      const stat = await statOrNull(resolvedPath);

      if (!stat) {
        return success({ resolvedPath, exists: false, isDirectory: false, isGitRepo: false, isEmpty: true });
      }
      if (!stat.isDirectory()) {
        return success({ resolvedPath, exists: true, isDirectory: false, isGitRepo: false, isEmpty: false });
      }

      const entries = await fs.promises.readdir(resolvedPath).catch(() => [] as string[]);
      return success({
        resolvedPath,
        exists: true,
        isDirectory: true,
        isGitRepo: entries.includes('.git'),
        isEmpty: entries.length === 0,
      });
    },

    getDefaultLocation(): ServiceResult<{ defaultLocation: string }> {
      return wrap(() => ({ defaultLocation: projectsRootPath(deps.userDataPath) }));
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
