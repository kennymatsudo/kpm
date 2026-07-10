import type { Project } from '../../../shared/types';
import { FileWatchService, type ContextFile } from '../files';
import { failure, success, type AsyncResult } from '../result';

export interface ContextFileServiceDeps {
  getProjectById: (projectId: string) => Project | undefined;
}

export function createContextFileService(deps: ContextFileServiceDeps) {
  FileWatchService.init({
    getProjectById: deps.getProjectById,
  });

  return {
    async readProjectContextFile(projectId: string): AsyncResult<{ content: string | null; filename?: string }> {
      const result = await FileWatchService.readProjectContextFile(projectId);
      if (!result.success) {
        return failure(result.error ?? 'Failed to read project context');
      }
      return success(
        result.filename ? { content: result.content, filename: result.filename } : { content: result.content },
      );
    },

    async writeProjectContextFile(projectId: string, content: string): AsyncResult<void> {
      const result = await FileWatchService.writeProjectContextFile(projectId, content);
      return result.success
        ? success(undefined)
        : failure(result.error ?? 'Failed to write project context');
    },

    async listContextFiles(projectId: string): AsyncResult<{ files: ContextFile[] }> {
      const result = await FileWatchService.listContextFiles(projectId);
      if (!result.success) {
        return failure(result.error ?? 'Failed to list context files');
      }
      return success({ files: result.files ?? [] });
    },

    async readContextFile(projectId: string, relativePath: string): AsyncResult<{ content: string | null }> {
      const result = await FileWatchService.readContextFile(projectId, relativePath);
      if (!result.success) {
        return failure(result.error ?? 'Failed to read context file');
      }
      return success({ content: result.content });
    },

    async readDocumentFile(projectId: string, filePath: string): AsyncResult<{ content: string | null }> {
      const result = await FileWatchService.readDocumentFile(projectId, filePath);
      if (!result.success) {
        return failure(result.error ?? 'Failed to read document file');
      }
      return success({ content: result.content });
    },

    async writeContextFile(projectId: string, relativePath: string, content: string): AsyncResult<void> {
      const result = await FileWatchService.writeContextFile(projectId, relativePath, content);
      return result.success
        ? success(undefined)
        : failure(result.error ?? 'Failed to write context file');
    },

    async deleteContextFile(projectId: string, relativePath: string): AsyncResult<void> {
      const result = await FileWatchService.deleteContextFile(projectId, relativePath);
      return result.success
        ? success(undefined)
        : failure(result.error ?? 'Failed to delete context file');
    },

    async importContextFile(projectId: string, sourcePath: string): AsyncResult<{ filename: string }> {
      const result = await FileWatchService.importContextFile(projectId, sourcePath);
      if (!result.success || !result.filename) {
        return failure(result.error ?? 'Failed to import context file');
      }
      return success({ filename: result.filename });
    },

    async buildContextPrefix(projectId: string, contextPaths: string[]): AsyncResult<string> {
      if (contextPaths.length === 0) return success('');

      // Read all context files in parallel instead of sequentially — with N files
      // this was previously O(N × per-file latency).
      const results = await Promise.all(
        contextPaths.map((filePath) => FileWatchService.readContextFile(projectId, filePath))
      );

      const sections: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.success && result.content) {
          sections.push(`<context-file path="${contextPaths[i]}">\n${result.content}\n</context-file>`);
        }
      }

      return success(sections.length > 0 ? sections.join('\n\n') + '\n\n' : '');
    },
  };
}

export type ContextFileService = ReturnType<typeof createContextFileService>;
