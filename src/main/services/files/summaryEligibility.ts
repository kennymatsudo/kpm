/**
 * Which project files get an AI summary.
 *
 * The rule: summarize only prose a person wrote, and never anything that could
 * hold a secret. A summary exists to help chat pick which document to open, and
 * producing one sends the file to the model, so a file must pass all three
 * checks below.
 */
import path from 'path';
import { HIDDEN_FILE_TREE_ENTRIES } from './fileTreeVisibility';

/**
 * Prose formats only. JSON, YAML, and TOML are data and config: they are where
 * secrets live, tool snapshots (`.playwright-mcp/*.yml`) use them, and a
 * one-line summary of them rarely helps anyone choose a file.
 */
const PROSE_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc']);

/** Folders that hold build output, caches, and test artifacts rather than documents. */
const GENERATED_DIRECTORIES = new Set<string>([
  ...HIDDEN_FILE_TREE_ENTRIES.map((entry) => entry.toLowerCase()),
  'dist',
  'build',
  'coverage',
  'logs',
  'tmp',
  'temp',
  'snapshots',
  '__snapshots__',
  'test-results',
  'playwright-report',
]);

/** A file name that announces credentials, e.g. `secrets.md` or `api-keys.txt`. */
const SECRET_FILE_NAME = /(^|[._-])(secrets?|credentials?|passwords?|passwd|api[-_]?keys?|private[-_]?keys?)([._-]|$)/i;

/**
 * High-confidence credential formats. Deliberately narrow: a false positive
 * only costs a missing summary, but a loose pattern would skip every doc that
 * talks about tokens.
 */
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /^\s*(export\s+)?[A-Z][A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*\S{8,}/m,
];

export function isSummarizablePath(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const fileName = segments.at(-1);
  if (!fileName) return false;

  const extension = path.extname(fileName).toLowerCase();
  if (!PROSE_EXTENSIONS.has(extension)) return false;
  // Dotfiles and dot-folders are tool state and config: `.env`, `.playwright-mcp/`, `.github/`, `.claude/`.
  if (segments.some((segment) => segment.startsWith('.'))) return false;
  if (segments.slice(0, -1).some((segment) => GENERATED_DIRECTORIES.has(segment.toLowerCase()))) return false;
  return !SECRET_FILE_NAME.test(path.basename(fileName, extension));
}

export function containsLikelySecret(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}
