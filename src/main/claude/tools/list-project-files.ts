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
- \`depth\`: Maximum recursion depth when \`recursive\` is true. Defaults to 10.

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
