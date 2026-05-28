/**
 * File Delete Tool
 *
 * project-root protection, protected-context-file protection, and realpath
 * access).
 *
 * This tool performs a cheap up-front validation (existence + protected-path
 * checks) so Claude gets immediate feedback for an obviously-invalid target
 * rather than queuing a confirmation that would fail on approval.
 *
 * Note: Tool handler is declared async per SDK requirements.
 */

import path from 'path';
import { z } from 'zod';
import { isContextFile } from '../../../shared/contextFile';
import { tool, jsonResult, toolError } from './index';
import type { FileExplorerService } from '../../services/files/FileExplorerService';

export interface FileDeletePayload {
  projectId: string;
  chatSessionId?: string;
  /** Project-relative path of the file or folder to delete. */
  path: string;
  /** Whether the target is a folder (so the UI can warn about recursive delete). */
  isDirectory: boolean;
}

export type FileDeleteCallback = (payload: FileDeletePayload) => void;

interface FileDeleteToolDeps {
  fileExplorerService: FileExplorerService;
  onFileDelete: FileDeleteCallback;
}


## When to Use
Use when the user explicitly asks to delete, remove, or discard a file or folder from the project file tree.

## Parameters
- \`projectId\`: The project UUID
- \`path\`: Relative path of the file or folder to delete (e.g., "drafts/old-spec.md", "archive").

## Examples
- Delete a file: path="notes/scratch.md"
- Delete a folder and its contents: path="drafts"

## Behavior
- Deleting a folder removes it and everything inside it (recursive).

## Restrictions
- Only operates on files inside the project file tree. Paths that escape the project (via \`..\` or symlinks pointing outside) are rejected.
- Cannot delete the project root.
- Cannot delete the project context file (AGENTS.md or CLAUDE.md).
- For files inside connected code repositories, this tool does not apply.`;

export function createFileDeleteTools(deps: FileDeleteToolDeps) {
  console.log('[KPM Tools] Creating delete_project_file tool');

  return [
    tool(
      'delete_project_file',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        path: z.string().min(1).describe('Relative path of the file or folder to delete'),
      },
      async ({ projectId, path: relativePath }) => {
        const normalizedPath = path.normalize(relativePath);
        // Cheap up-front guards so Claude gets immediate feedback instead of
        // queuing a confirmation that would fail on approval. The authoritative
        // checks still run in deleteEntry when the user approves.
        if (normalizedPath === '.') {
          return toolError('Cannot delete the project root.');
        }
        const basename = path.basename(normalizedPath);
        if (isContextFile(basename)) {
          return toolError(`Cannot delete ${basename} — it is a protected project context file.`);
        }

        // Confirm the target exists (and learn whether it's a folder) before
        // proposing. getInfo enforces project-path containment.
        const info = await deps.fileExplorerService.getInfo(projectId, normalizedPath);
        if (!info.ok) {
          return toolError(info.error);
        }

        try {
          deps.onFileDelete({
            projectId,
            path: normalizedPath,
            isDirectory: info.data.isDirectory,
          });
        } catch (error) {
          return toolError(`Failed to propose deletion: ${error instanceof Error ? error.message : String(error)}`);
        }

        return jsonResult({
          success: true,
          proposedPath: normalizedPath,
          isDirectory: info.data.isDirectory,
        });
      }
    ),
  ];
}
