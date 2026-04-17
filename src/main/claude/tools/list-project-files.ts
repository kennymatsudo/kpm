/**
 * List Project Files Tool
 *
 * Allows Claude to list files and folders in the project's file tree.
 * Read-only — no approval flow.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import type { FileExplorerService } from '../../services/files/FileExplorerService';

interface ListProjectFilesToolDeps {
  fileExplorerService: FileExplorerService;
}

const TOOL_DESCRIPTION = `List files and folders within the project's file tree.

## When to Use
Use when the user asks what files or folders exist in the project, wants to browse the project structure, or needs to know what documents are available.

## Parameters
- \`projectId\`: The project UUID
- \`path\`: Relative path to list. Use "" (empty string) for the project root. Example: "specs", "docs/archive".
- \`depth\`: Maximum recursion depth when \`recursive\` is true. Defaults to 10.

## Notes

export function createListProjectFilesTools(deps: ListProjectFilesToolDeps) {
  return [
    tool(
      'list_project_files',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        path: z.string().default('').describe('Relative path to list. Use "" for project root.'),
        depth: z.number().int().min(1).max(20).default(10).describe('Max recursion depth when recursive is true'),
      },
          recursive,
          depth,
        });

        if (!result.ok) {
          return toolError(result.error);
        }

        return jsonResult({
          path: path || '',
          recursive,
        });
      }
    ),
  ];
}
