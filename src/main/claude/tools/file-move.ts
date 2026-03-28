/**
 * File Move Tool
 *
 * Allows Claude to move files and folders within a project's file tree.
 * Executes immediately (no approval flow) and emits file change events
 * for real-time UI updates.
 *
 * Note: Tool handler is declared async per SDK requirements, though it awaits
 * the rename operation.
 */

import path from 'path';
import { z } from 'zod';
import type { BrowserWindow } from 'electron';
import { isContextFile } from '../../../shared/contextFile';
import { tool, jsonResult, toolError } from './index';
import type { FileExplorerService } from '../../services/files/FileExplorerService';

interface FileMoveToolDeps {
  fileExplorerService: FileExplorerService;
  getMainWindow: () => BrowserWindow | null;
}

const TOOL_DESCRIPTION = `Move a file or folder to a different location within the project files.

## When to Use
Use when the user asks to reorganize, move, or relocate files/folders in the project file tree.

## Parameters
- \`projectId\`: The project UUID
- \`sourcePath\`: Current relative path of the file/folder (e.g., "old-location/spec.md")
- \`targetFolder\`: Destination folder relative path. Use "" (empty string) for the project root.

## Examples
- Move "spec.md" to "archive/": sourcePath="spec.md", targetFolder="archive"
- Move "notes/todo.md" to root: sourcePath="notes/todo.md", targetFolder=""
- Move folder "drafts" into "specs/": sourcePath="drafts", targetFolder="specs"

## Restrictions
- Cannot move the project context file (AGENTS.md or CLAUDE.md)
- Cannot move a file to its current location (no-op)`;

export function createFileMoveTools(deps: FileMoveToolDeps) {

  return [
    tool(
      'move_project_file',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        sourcePath: z.string().min(1).describe('Current relative path of the file or folder to move'),
        targetFolder: z.string().describe('Destination folder relative path. Use "" for project root.'),
      },
      async ({ projectId, sourcePath, targetFolder }) => {
        // Protect project context files from being moved
        const basename = path.basename(sourcePath);
        if (isContextFile(basename)) {
          return toolError(`Cannot move ${basename} — it is a protected project context file.`);
        }

        // Compute new path
        const newPath = targetFolder ? path.join(targetFolder, basename) : basename;

        // Check same-location no-op
        if (newPath === sourcePath) {
          return toolError('File is already in that location.');
        }

        try {
          const result = await deps.fileExplorerService.rename(projectId, sourcePath, newPath);

          if (!result.ok) {
            return toolError(result.error);
          }

          // Emit file change event for real-time UI update
          const mainWindow = deps.getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send('file-explorer:file-changed', {
              projectId,
              type: 'renamed',
              path: sourcePath,
              newPath,
              isDirectory: result.data.isDirectory,
            });
          }

          return jsonResult({
            success: true,
            oldPath: sourcePath,
            newPath,
            isDirectory: result.data.isDirectory,
          });
        } catch (error) {
          return toolError(`Failed to move file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ),
  ];
}
