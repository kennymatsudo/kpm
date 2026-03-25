/**
 * Context builders for Claude sessions.
 *
 * These functions build the context objects needed for Claude sessions,
 * separating data fetching from the session lifecycle management.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CONTEXT_FILE_NAMES } from '../../shared/contextFile';
import type { PlanContext } from './prompts/types';

/**
 * Read the project context file (AGENTS.md or CLAUDE.md) from a project's folder.
 * Checks AGENTS.md first, then falls back to CLAUDE.md.
 * Returns null if neither file exists or is unreadable.
 */
function readContextFile(folderPath: string): string | null {
  for (const filename of CONTEXT_FILE_NAMES) {
    try {
      const filePath = path.join(folderPath, filename);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch {
      // File doesn't exist or isn't readable — try next
    }
  }
  return null;
}



  };
}
