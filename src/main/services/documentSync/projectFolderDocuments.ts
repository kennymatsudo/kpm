import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { IProjectRepository } from '../../db/interfaces/project';
import { resolveScopedPath } from '../files/scopedFs';
import type { LocalDocument, LocalDocumentStore } from './types';

export function createProjectFolderDocumentStore(
  projects: IProjectRepository,
): LocalDocumentStore {
  return {
    open(projectId: string, documentPath: string): LocalDocument {
      const projectFolder = projects.get(projectId)?.folder_path ?? null;
      if (!projectFolder) throw new Error('Project folder not found');

      const scoped = resolveScopedPath(projectFolder, documentPath);
      if (!scoped.valid) throw new Error('Invalid document path');
      const fullPath = scoped.fullPath;

      return {
        read: () => (existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : null),
        write: (content: string) => writeFileSync(fullPath, content, 'utf-8'),
      };
    },
  };
}
