/**
 * Tool for recovering MCP tool-result spill files.
 *
 * When an MCP tool returns a result larger than the SDK's token budget, the SDK
 * saves the full payload to a file under ~/.claude/projects/ and instructs the
 * agent to read it back in chunks. In KPM grounded chat there is no shell tool
 * and the spill directory is outside the Read/Grep/Glob permitted scope, so the
 * SDK-prescribed recovery path is structurally unavailable.
 *
 * This tool provides a narrowly-scoped, read-only alternative:
 * - accepts only absolute paths within ~/.claude/projects/ (no parent traversal)
 * - supports character-range access (offset + length) for single-line JSON blobs
 * - is read-only by design (P7 compliance)
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { normalize, relative } from 'path';
import { tool, toolResult, toolError, toolLog } from './index';

/** Maximum characters returned per call — keeps context overhead bounded. */
const MAX_READ_CHARS = 50_000;

/**
 * Resolve and validate that an absolute path is within ~/.claude/projects/.
 * Returns the normalized path, or null if it escapes the allowed root.
 */
export function resolveSpillPath(filePath: string): string | null {
  const spillRoot = normalize(`${homedir()}/.claude/projects`);
  const normalized = normalize(filePath);
  const rel = relative(spillRoot, normalized);
  // Reject if the relative path starts with '..' (escape attempt) or is
  // absolute (which relative() returns on Windows for different drives).
  if (rel.startsWith('..') || rel.startsWith('/') || rel.startsWith('\\')) {
    return null;
  }
  return normalized;
}

export function createSpillReadTools() {
  return [
    tool(
      'read_spill_file',
      `Page through a tool result that was too large to return. When a tool call fails with "exceeds maximum allowed tokens" and names a file saved under ~/.claude/projects/, read that file here rather than dropping the data or re-querying another way. Call it with just file_path first, then continue from the offset it reports. Returns a header line with the character range and total size, then up to ${MAX_READ_CHARS.toLocaleString()} characters of the saved text. Reads only files under ~/.claude/projects/.`,
      {
        file_path: z
          .string()
          .min(1)
          .describe(
            'Absolute path to the spill file as shown in the overflow error message, ' +
            'e.g. "/Users/you/.claude/projects/.../tool-results/mcp-Slack-...-1234.txt"'
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Character offset to start reading from (default: 0)'),
        length: z
          .number()
          .int()
          .min(1)
          .max(MAX_READ_CHARS)
          .optional()
          .describe(
            `Number of characters to read (default and max: ${MAX_READ_CHARS.toLocaleString()})`
          ),
      },
      async ({ file_path, offset = 0, length = MAX_READ_CHARS }) => {
        toolLog(`[KPM Tools] read_spill_file offset=${offset} length=${length} path=${file_path}`);

        const safePath = resolveSpillPath(file_path);
        if (!safePath) {
          return toolError(
            `"${file_path}" is outside the allowed spill directory (~/.claude/projects/). ` +
            'Only files saved by the SDK under that path can be read with this tool.'
          );
        }

        let content: string;
        try {
          content = await fs.readFile(safePath, 'utf-8');
        } catch (err) {
          return toolError(
            `Could not read spill file: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        const totalChars = content.length;
        const effectiveLength = Math.min(length, MAX_READ_CHARS);
        const slice = content.slice(offset, offset + effectiveLength);
        const nextOffset = offset + slice.length;
        const hasMore = nextOffset < totalChars;

        const range = `chars ${offset}-${nextOffset} of ${totalChars}`;
        const header = hasMore ? `${range}; continue with offset ${nextOffset}` : `${range}; end of file`;
        return toolResult(`${header}\n\n${slice}`);
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}
