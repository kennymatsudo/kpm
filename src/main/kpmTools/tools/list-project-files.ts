/**
 * List Project Files Tool
 *
 * Allows Claude to list files and folders in the project's file tree.
 * Read-only — no approval flow.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, projectScoped } from './index';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import { HIDDEN_FILE_TREE_ENTRIES } from '../../services/files/fileTreeVisibility';

interface ListProjectFilesToolDeps {
  fileExplorerService: FileExplorerService;
}

const HIDDEN_FILE_TREE_ENTRIES_DESCRIPTION = HIDDEN_FILE_TREE_ENTRIES.map((entry) => `\`${entry}\``).join(', ');

const TOOL_DESCRIPTION = `List files and folders in the KPM project folder: the project's notes, specs, and docs, not the files of a connected code repo (use Glob, Grep, and Read for those). Use it to see what is written down, or to find the document a question depends on. For a survey, pass recursive: true and structureOnly: true; each document carries a one-line summary, so pick files to open with read_project_file from the summaries instead of opening files to learn what they are. A summary is a hint that can lag recent edits, and a missing one means the file is not indexed yet, not that it is irrelevant.

Returns a flat list in folder order; folder paths end in "/". A recursive listing returns up to 200 entries by default; when truncated is true, pass nextCursor as cursor for the next page. Generated and cache folders (${HIDDEN_FILE_TREE_ENTRIES_DESCRIPTION}) are hidden.`;

export function createListProjectFilesTools(deps: ListProjectFilesToolDeps) {
  return [
    tool(
      'list_project_files',
      TOOL_DESCRIPTION,
      {
        path: z.string().default('').describe('Relative path to list. Use "" for project root.'),
        recursive: z.boolean().default(false).describe('Return all descendants when true'),
        depth: z.number().int().min(1).max(20).default(10).describe('Max recursion depth when recursive is true'),
        limit: z.number().int().min(1).max(2000).optional().describe('Max entries to return (default 200 for recursive)'),
        cursor: z.string().optional().describe('Opaque continuation handle from a previous truncated response'),
        structureOnly: z.boolean().optional().describe('Omit size and modified time, keeping path and summary'),
      },
      projectScoped(async ({ projectId, path, recursive, depth, limit, cursor, structureOnly }) => {
        const result = await deps.fileExplorerService.listDirectoryPaged(projectId, path, {
          recursive,
          depth,
          backfillMissingSummaries: true,
          limit,
          cursor,
          structureOnly,
        });

        if (!result.ok) {
          return toolError(result.error);
        }

        const { nodes, truncated, nextCursor } = result.data;

        return jsonResult({
          count: nodes.length,
          nodes: nodes.map((node) => ({
            path: node.isDirectory ? `${node.path}/` : node.path,
            ...(node.isSymlink ? { symlink: true } : {}),
            ...(node.summary ? { summary: node.summary } : {}),
            ...(structureOnly || node.isDirectory ? {} : { size: node.size, modifiedAt: node.modifiedAt }),
          })),
          truncated,
          ...(nextCursor !== undefined ? { nextCursor } : {}),
        });
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
