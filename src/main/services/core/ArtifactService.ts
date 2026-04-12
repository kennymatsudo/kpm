import type { IProjectRepository } from '../../db/interfaces';
import type path from 'path';
import type fs from 'fs';
import { failure, success, type ServiceResult } from '../result';

type PathModule = typeof path;
type FsModule = typeof fs;

export interface ArtifactRecord {
  filename: string;
  path: string;
  createdAt: string;
  modifiedAt: string;
  size: number;
}

export interface ArtifactServiceDeps {
  projects: IProjectRepository;
  fs: FsModule;
  path: PathModule;
}

export function createArtifactService(deps: ArtifactServiceDeps) {
  function getProjectOrThrow(projectId: string) {
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }

  function resolveOutputFilePath(projectFolderPath: string, filename: string): string {
    const outputsDir = deps.path.resolve(projectFolderPath, 'outputs');
    const filePath = deps.path.resolve(outputsDir, filename);
    const relative = deps.path.relative(outputsDir, filePath);
    if (relative.startsWith('..') || deps.path.isAbsolute(relative)) {
      throw new Error('Invalid file path');
    }
    return filePath;
  }

  function getOutputsDir(projectId: string): { projectPath: string; outputsDir: string } {
    const project = getProjectOrThrow(projectId);
    return {
      projectPath: project.folder_path,
      outputsDir: deps.path.join(project.folder_path, 'outputs'),
    };
  }

  return {
    list(projectId: string): ServiceResult<{ artifacts: ArtifactRecord[] }> {
      try {
        const { projectPath, outputsDir } = getOutputsDir(projectId);
        if (!deps.fs.existsSync(outputsDir)) {
          return success({ artifacts: [] });
        }

        const artifacts = deps.fs
          .readdirSync(outputsDir)
          .filter((file) => file.endsWith('.md'))
          .map((file) => {
            const filePath = deps.path.join(outputsDir, file);
            const stats = deps.fs.statSync(filePath);
            return {
              filename: file,
              path: deps.path.relative(projectPath, filePath),
              createdAt: stats.birthtime.toISOString(),
              modifiedAt: stats.mtime.toISOString(),
              size: stats.size,
            };
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return success({ artifacts });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    read(projectId: string, filename: string): ServiceResult<{ content: string }> {
      try {
        const project = getProjectOrThrow(projectId);
        const filePath = resolveOutputFilePath(project.folder_path, filename);
        if (!deps.fs.existsSync(filePath)) {
          return failure('Artifact not found');
        }

        return success({ content: deps.fs.readFileSync(filePath, 'utf-8') });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    delete(projectId: string, filename: string): ServiceResult<void> {
      try {
        const project = getProjectOrThrow(projectId);
        const filePath = resolveOutputFilePath(project.folder_path, filename);
        if (!deps.fs.existsSync(filePath)) {
          return failure('Artifact not found');
        }

        deps.fs.unlinkSync(filePath);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    import(projectId: string, sourcePath: string): ServiceResult<{ filename: string }> {
      try {
        const { outputsDir } = getOutputsDir(projectId);
        if (!deps.fs.existsSync(outputsDir)) {
          deps.fs.mkdirSync(outputsDir, { recursive: true });
        }

        let filename = deps.path.basename(sourcePath);
        if (!filename.endsWith('.md')) {
          filename += '.md';
        }

        let targetPath = deps.path.join(outputsDir, filename);
        let counter = 1;
        const baseName = filename.replace(/\.md$/, '');
        while (deps.fs.existsSync(targetPath)) {
          filename = `${baseName} (${counter}).md`;
          targetPath = deps.path.join(outputsDir, filename);
          counter++;
        }

        const content = deps.fs.readFileSync(sourcePath, 'utf-8');
        deps.fs.writeFileSync(targetPath, content, 'utf-8');
        return success({ filename });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type ArtifactService = ReturnType<typeof createArtifactService>;
