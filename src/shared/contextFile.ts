/**
 * Project context file conventions.
 *
 * AI coding agents use a markdown file at the project root for persistent
 * project knowledge. Different tools use different filenames:
 *   - AGENTS.md  — open standard (Linux Foundation / Agentic AI Foundation)
 *   - CLAUDE.md  — Claude Code convention
 *
 */

/** Filenames to check, in priority order. */

/** Default filename when creating a new context file. */

/** Check whether a filename is a recognized context file. */
export function isContextFile(filename: string): boolean {
  return (CONTEXT_FILE_NAMES as readonly string[]).includes(filename);
}

/** Lower values are preferred when multiple context files exist. */
export function getContextFilePriority(filename: string): number {
  const priority = (CONTEXT_FILE_NAMES as readonly string[]).indexOf(filename);
  return priority === -1 ? Number.POSITIVE_INFINITY : priority;
}
