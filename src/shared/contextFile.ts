/**
 * Project context file conventions.
 *
 * AI coding agents use a markdown file at the project root for persistent
 * project knowledge. Different tools use different filenames:
 *   - AGENTS.md  — open standard (Linux Foundation / Agentic AI Foundation)
 *   - CLAUDE.md  — Claude Code convention
 *
 * KPM checks for these in priority order and uses the first one found.
 */

/** Canonical filename KPM owns and shows to users. */
export const PRIMARY_CONTEXT_FILENAME = 'AGENTS.md';

/** Compatibility filename for tools that still auto-load CLAUDE.md. */
export const COMPAT_CONTEXT_FILENAME = 'CLAUDE.md';

/** Filenames to check, in priority order. */
export const CONTEXT_FILE_NAMES = [PRIMARY_CONTEXT_FILENAME, COMPAT_CONTEXT_FILENAME] as const;

/** Default filename when creating a new context file. */
export const DEFAULT_CONTEXT_FILENAME = PRIMARY_CONTEXT_FILENAME;

/**
 * Cache key for pending (proposed-but-unapproved) context-file content.
 * Shared by the built-in Write/Edit interception (permissions.ts) and the
 * propose_context_edit tool so edits from either path accumulate in one
 * cache within a turn, independent of which resolved filename
 * (AGENTS.md/CLAUDE.md) is in play.
 */
export const CONTEXT_FILE_PENDING_CACHE_KEY = '__context__';

/** Check whether a filename is a recognized context file. */
export function isContextFile(filename: string): boolean {
  return (CONTEXT_FILE_NAMES as readonly string[]).includes(filename);
}

/** Lower values are preferred when multiple context files exist. */
export function getContextFilePriority(filename: string): number {
  const priority = (CONTEXT_FILE_NAMES as readonly string[]).indexOf(filename);
  return priority === -1 ? Number.POSITIVE_INFINITY : priority;
}

/** Distinctive substring of the placeholder content, stable across project names. */
const PLACEHOLDER_CONTEXT_MARKER =
  'This is your project workspace. Use this file to track context, conventions, and learnings.';

/** Content written to a project's context file at creation, before real generation runs. */
export function buildPlaceholderContext(projectName: string): string {
  return `# ${projectName}

${PLACEHOLDER_CONTEXT_MARKER}
`;
}

/** Whether `content` is still the untouched placeholder written at project creation. */
export function isPlaceholderContext(content: string): boolean {
  return content.includes(PLACEHOLDER_CONTEXT_MARKER);
}
