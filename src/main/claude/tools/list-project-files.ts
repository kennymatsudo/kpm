/**
 * List Project Files Tool
 *
 * Allows Claude to list files and folders in the project's file tree.
 * Read-only — no approval flow.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import { HIDDEN_FILE_TREE_ENTRIES } from '../../services/files/fileTreeVisibility';

interface ListProjectFilesToolDeps {
  fileExplorerService: FileExplorerService;
}

const HIDDEN_FILE_TREE_ENTRIES_DESCRIPTION = HIDDEN_FILE_TREE_ENTRIES.map((entry) => `\`${entry}\``).join(', ');

const TOOL_DESCRIPTION = `List files and folders within the project's file tree.

## When to Use
Use when the user asks what files or folders exist in the project, wants to browse the project structure, or needs to know what documents are available.

## Parameters
- \`projectId\`: The project UUID
- \`path\`: Relative path to list. Use "" (empty string) for the project root. Example: "specs", "docs/archive".
- \`recursive\`: When true, returns all descendants. Defaults to false (lists only the immediate children).
- \`depth\`: Maximum recursion depth when \`recursive\` is true. Defaults to 10.
- \`limit\`: Maximum total nodes to return. Defaults to 500 for recursive listings. Use with \`cursor\` to page through large trees.
- \`cursor\`: Opaque handle from a previous truncated response — pass it unchanged to receive the next page.
- \`structureOnly\`: When true, each node includes only name, path, isDirectory, and isSymlink — omitting size, modifiedAt, and summary. Produces a much smaller response; ideal for an initial tree survey.

## Response shape
The response is a **flat, DFS-ordered list** of nodes (no nested children).
- \`count\`: Total nodes in this response page.
- \`truncated\`: True when results were cut off at \`limit\`.
- \`nextCursor\`: Present when \`truncated\` is true. Pass it as \`cursor\` in the next call to continue.

## Choosing what to read
For a quick project survey use \`recursive: true, structureOnly: true\` — the tree shape fits in one small call for most projects. If the response is \`truncated\`, pass \`nextCursor\` as \`cursor\` to get the next page. Once you know which files are relevant, fetch their summaries or full content with \`read_project_file\`. A \`summary\` is a hint, not full content: it can lag recent edits or omit detail, so stay free to open any file. A missing \`summary\` means the file has not been indexed yet, not that it is irrelevant.

## Notes
- Generated/cache paths (${HIDDEN_FILE_TREE_ENTRIES_DESCRIPTION}) are hidden. All other files, including dotfiles, are visible.
- Lists files in the developer's KPM project folder only. For files inside connected code repositories, use Glob/Read/Grep instead.`;

export function createListProjectFilesTools(deps: ListProjectFilesToolDeps) {
  return [
    tool(
      'list_project_files',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        path: z.string().default('').describe('Relative path to list. Use "" for project root.'),
        recursive: z.boolean().default(false).describe('Return all descendants when true'),
        depth: z.number().int().min(1).max(20).default(10).describe('Max recursion depth when recursive is true'),
        limit: z.number().int().min(1).max(2000).optional().describe('Max total nodes to return (default 500 for recursive). Use with cursor to page through large trees.'),
        cursor: z.string().optional().describe('Opaque continuation handle from a previous truncated response'),
        structureOnly: z.boolean().optional().describe('When true, return only name/path/isDirectory/isSymlink per node — omits size, modifiedAt, summary. Much smaller output.'),
      },
      async ({ projectId, path, recursive, depth, limit, cursor, structureOnly }) => {
        const result = await deps.fileExplorerService.listDirectoryPaged(projectId, path, {
          recursive,
          depth,
          backfillMissingSummaries: !structureOnly,
          limit,
          cursor,
          structureOnly,
        });

        if (!result.ok) {
          return toolError(result.error);
        }

        const { nodes, truncated, nextCursor } = result.data;

        return jsonResult({
          path: path || '',
          recursive,
          count: nodes.length,
          nodes,
          truncated,
          ...(nextCursor !== undefined ? { nextCursor } : {}),
        });
      }
    ),
  ];
}
