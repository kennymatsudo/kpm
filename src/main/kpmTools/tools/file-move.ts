/**
 * File Move Tool
 *
 * Allows Claude to submit a move/rename proposal for files and folders within
 * a project's file tree. Like document edits and deletes, KPM either queues it
 * for user review or auto-applies it according to the user's approval setting.
 */

import path from 'path';
import { z } from 'zod';
import { isContextFile } from '../../../shared/contextFile';
import { tool, jsonResult, toolError } from './index';

export interface FileMovePayload {
  projectId: string;
  chatSessionId?: string;
  sourcePath: string;
  targetPath: string;
}

export type FileMoveCallback = (payload: FileMovePayload) => void;

interface FileMoveToolDeps {
  onFileMove: FileMoveCallback;
}

const TOOL_DESCRIPTION = `Submit a move for a file or folder within the project files. KPM queues or applies it according to the user's approval setting.

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

## Behavior
- In review mode, KPM opens a confirmation in the approval panel; in auto-apply mode, KPM moves immediately.

## Restrictions
- Cannot move the project context file (AGENTS.md or CLAUDE.md)
- Cannot move a file to its current location (no-op)`;

export function createFileMoveTools(deps: FileMoveToolDeps) {
  console.log('[KPM Tools] Creating move_project_file tool');

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
        const basename = path.basename(sourcePath);
        if (isContextFile(basename)) {
          return toolError(`Cannot move ${basename} — it is a protected project context file.`);
        }

        const targetPath = targetFolder ? path.join(targetFolder, basename) : basename;
        if (targetPath === sourcePath) {
          return toolError('File is already in that location.');
        }

        await Promise.resolve();
        deps.onFileMove({ projectId, sourcePath, targetPath });

        return jsonResult({
          success: true,
          sourcePath,
          targetPath,
          proposalSubmitted: true,
        });
      }
    ),
  ];
}
