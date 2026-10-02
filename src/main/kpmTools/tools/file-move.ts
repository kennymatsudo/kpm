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
import { tool, jsonResult, toolError, projectScoped } from './index';

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

const TOOL_DESCRIPTION = `Propose moving a file or folder to another folder in the KPM project folder, when the user asks to reorganize or relocate documents. KPM queues the move for review or applies it, per the user's setting. The item keeps its name; targetFolder "" means the project root, so sourcePath "notes/todo.md" with targetFolder "" moves it to the root. The project context file (AGENTS.md or CLAUDE.md) cannot be moved. To rename a file, propose_document_create the new path and delete_project_file the old one.`;

export function createFileMoveTools(deps: FileMoveToolDeps) {
  return [
    tool(
      'move_project_file',
      TOOL_DESCRIPTION,
      {
        sourcePath: z.string().min(1).describe('Current relative path of the file or folder to move'),
        targetFolder: z.string().describe('Destination folder, relative to the project root; "" for the root itself'),
      },
      projectScoped(async ({ projectId, sourcePath, targetFolder }) => {
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

        return jsonResult({ success: true, sourcePath, targetPath });
      })
    ),
  ];
}
