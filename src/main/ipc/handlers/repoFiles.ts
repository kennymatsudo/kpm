import { RepoFileSchemas } from '../validation';
import type { RepoFileService } from '../../services/files/RepoFileService';
import { unwrapOrThrow } from '../../services/result';
import { toIpcResponse } from '../response';

/**
 * Register IPC handlers for repo file operations.
 * These handle file operations within connected repositories for the workspace view.
 */
export function registerRepoFileHandlers(repoFileService: RepoFileService): void {
  // List directory contents within a repo
    const { repoId, path, recursive, depth } = RepoFileSchemas.listDirectory.parse(params);
  });

  // Read file content from a repo
    const { repoId, path } = RepoFileSchemas.readFile.parse(params);
  });

  // Write file content to a repo (markdown/text files only)
    const { repoId, path, content } = RepoFileSchemas.writeFile.parse(params);
  });

  // Get info about a single file/folder
    const { repoId, path } = RepoFileSchemas.getInfo.parse(params);
  });
}
