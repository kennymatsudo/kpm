/**
 * Document Edit Tool
 *
 * Allows Claude to submit edits to existing project files using old_string → new_string.
 * Only the changed portion is sent as output tokens; the full new content is computed
 * server-side and emitted as a DocumentUpdatePayload (same shape as document-update.ts).
 *
 * Supports both single-hunk (old_string/new_string) and batch (edits[]) modes.
 * In batch mode all hunks are validated and applied atomically — one combined diff
 * is surfaced for approval and the pending-content cache is updated once.
 *
 * Note: Tool handlers are declared async per SDK requirements, though most don't await.
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { DocumentUpdateCallback } from './document-update';

export type ReadProjectFileFn = (projectId: string, filePath: string) => Promise<string | null>;

const TOOL_DESCRIPTION = `Submit one or more edits to an existing project file (relative path, e.g. "guide.md"). KPM queues or applies them according to the user's approval setting.

For new files use \`propose_document_create\`. For the project context file (AGENTS.md / CLAUDE.md) use \`propose_context_edit\`.

Rules:
- old_string must match exactly one location (whitespace + indentation included). If missing or non-unique, the call fails — add more surrounding context.
- old_string and new_string must differ.
- Treat \`@plan/<uuid>\` tokens as atomic; never split one across the boundary or partially overwrite the UUID. Use only UUIDs from the system prompt's Item Reference. Refs in prose render as live chips locally and rewrite to native tracker syntax on export.
- Multiple edits to the same file: use edits[] to batch related hunks in one atomic call (single approval). Hunks apply in order, each against the result of prior hunks. A failing hunk cancels the whole batch.`;

/** A single find-and-replace hunk. */
interface EditHunk {
  old_string: string;
  new_string: string;
}

/**
 * Apply a list of hunks sequentially against a base content string.
 *
 * Each hunk is validated against the running content after prior hunks have
 * been applied ("each must match exactly once after prior hunks apply"). If any
 * hunk fails, the function returns immediately without applying further hunks —
 * callers must not emit a partial result.
 */
export function applyHunks(
  baseContent: string,
  hunks: EditHunk[]
): { success: true; content: string } | { success: false; hunkIndex: number; reason: string } {
  let content = baseContent;
  for (let i = 0; i < hunks.length; i++) {
    const { old_string, new_string } = hunks[i];

    if (old_string === new_string) {
      return { success: false, hunkIndex: i, reason: 'old_string and new_string are identical — no change would be made' };
    }

    const firstIndex = content.indexOf(old_string);
    if (firstIndex === -1) {
      return { success: false, hunkIndex: i, reason: 'old_string not found — call read_project_file to get the exact current text including whitespace and indentation' };
    }

    const secondIndex = content.indexOf(old_string, firstIndex + 1);
    if (secondIndex !== -1) {
      return { success: false, hunkIndex: i, reason: 'old_string appears multiple times — include more surrounding context to make the match unique' };
    }

    content = content.slice(0, firstIndex) + new_string + content.slice(firstIndex + old_string.length);
  }
  return { success: true, content };
}

/**
 * Create the document edit tool.
 *
 * @param readFile - Function to read a project file by projectId and relative path
 * @param onDocumentUpdate - Callback to emit proposed update to the UI for approval
 */
export function createDocumentEditTools(
  readFile: ReadProjectFileFn,
  onDocumentUpdate: DocumentUpdateCallback
) {
  console.log('[KPM Tools] Creating propose_document_edit tool');

  return [
    tool(
      'propose_document_edit',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        filePath: z.string().min(1)
          .refine(
            (p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.includes('..'),
            'File path must be a relative path within the KPM project (e.g., "guide.md"). Do not use absolute paths from connected repositories or the local filesystem.'
          )
          .describe('Relative file path within the KPM project (e.g., "guide.md", "meeting-notes.md"). Must be relative — never an absolute path like /Users/... or a path into a connected repo.'),
        old_string: z.string().min(1).optional().describe('The exact text to find in the file (single-hunk mode). Must match exactly one location. Omit when using edits[].'),
        new_string: z.string().optional().describe('The replacement text (single-hunk mode). Can be empty to delete old_string. Omit when using edits[].'),
        edits: z.array(
          z.object({
            old_string: z.string().min(1).describe('The exact text to find. Must match exactly one location after prior hunks have been applied.'),
            new_string: z.string().describe('The replacement text. Can be empty to delete old_string.'),
          })
        ).min(1).optional().describe('Batch of hunks to apply atomically (preferred for multiple related changes to one file). Hunks are validated and applied in order; a failing hunk cancels the whole batch with no partial changes.'),
        expectedHash: z.string().optional().describe('Hash returned by read_project_file. If provided and the file has changed since the read, the call fails so you can re-read before editing.'),
      },
      async ({ projectId, filePath, old_string, new_string, edits, expectedHash }) => {
        const isBatch = Array.isArray(edits) && edits.length > 0;

        if (!isBatch) {
          if (!old_string) {
            return toolError('Provide old_string and new_string for a single edit, or edits[] for a batch.');
          }
          if (new_string === undefined) {
            return toolError('Provide new_string for a single edit (use an empty string to delete old_string).');
          }
        }

        toolLog(
          isBatch
            ? `[KPM Tools] propose_document_edit ${projectId} ${filePath} (batch, ${edits.length} hunks)`
            : `[KPM Tools] propose_document_edit ${projectId} ${filePath} (old=${old_string!.length} new=${(new_string ?? '').length})`
        );

        // Read current file content (pending cache or disk, via readFile)
        let currentContent: string | null;
        try {
          currentContent = await readFile(projectId, filePath);
        } catch (error) {
          console.error(`[KPM Tools] Error reading file:`, error);
          return toolError(`Failed to read file "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
        }

        if (currentContent === null) {
          return toolError(`File "${filePath}" not found. Use propose_document_create to create a new file.`);
        }

        // Hash guard: if caller supplied a hash, verify the file hasn't changed since their read
        if (expectedHash !== undefined) {
          const actualHash = createHash('sha256').update(currentContent).digest('hex').slice(0, 16);
          if (actualHash !== expectedHash) {
            return toolError(
              `File "${filePath}" changed since last read (hash mismatch). Call read_project_file again before editing.`
            );
          }
        }

        let newContent: string;

        if (isBatch) {
          // Batch path: validate and apply all hunks atomically
          const result = applyHunks(currentContent, edits);
          if (!result.success) {
            return toolError(
              `Hunk ${result.hunkIndex + 1} of ${edits.length} failed in "${filePath}": ${result.reason}.`
            );
          }
          newContent = result.content;
        } else {
          // Single-hunk path: existing behaviour
          const oldStr = old_string!;
          const newStr = new_string ?? '';

          const firstIndex = currentContent.indexOf(oldStr);
          if (firstIndex === -1) {
            return toolError(`old_string not found in "${filePath}". Call read_project_file to get the exact current text including whitespace and indentation.`);
          }

          const secondIndex = currentContent.indexOf(oldStr, firstIndex + 1);
          if (secondIndex !== -1) {
            return toolError(`old_string appears multiple times in "${filePath}". Include more surrounding context to make the match unique.`);
          }

          if (oldStr === newStr) {
            return toolError('old_string and new_string are identical. No change would be made.');
          }

          newContent = currentContent.slice(0, firstIndex) + newStr + currentContent.slice(firstIndex + oldStr.length);
        }

        try {
          // Pass the pre-edit content forward so subscribers don't re-read disk.
          // For batches this single emit updates the pending cache once with the
          // fully-combined result, so subsequent reads within the turn see all hunks.
          onDocumentUpdate({ projectId, filePath, content: newContent, oldContent: currentContent });
        } catch (error) {
          console.error(`[KPM Tools] Error emitting document edit:`, error);
          return toolError(`Failed to propose document edit: ${error instanceof Error ? error.message : String(error)}`);
        }

        const linesBefore = currentContent.split('\n').length;
        const linesAfter = newContent.split('\n').length;

        return jsonResult({
          success: true,
          filePath,
          ...(isBatch ? { hunksApplied: edits.length } : {}),
          linesAdded: Math.max(0, linesAfter - linesBefore),
          linesRemoved: Math.max(0, linesBefore - linesAfter),
          totalLines: linesAfter,
        });
      }
    ),
  ];
}
