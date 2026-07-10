import type { Project } from '../../../shared/types';
import { FileWatchService } from '../files';
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
