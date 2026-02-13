/**
 * Shared Validation Components
 *
 * Reusable Zod schema components used across multiple domain schemas.
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';

// =============================================================================
// Basic Types
// =============================================================================

/** UUID string validation */
export const uuid = z.string().uuid('Invalid ID format (expected UUID)');

/** Non-empty trimmed string */
export const nonEmptyString = (fieldName: string) =>
  z.string().min(1, `${fieldName} cannot be empty`).trim();

/** Optional string that trims whitespace */
export const optionalString = z.string().trim().optional();

// =============================================================================
// Project & Plan Types
// =============================================================================

/** Project name with reasonable length limits */
export const projectName = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(100, 'Project name must be under 100 characters')
  .trim();

/** Project phase enum */
export const projectPhase = z.enum(['discovery', 'high_level', 'detailed', 'ready'], {
  message: 'Invalid phase. Must be: discovery, high_level, detailed, or ready',
});

/** Plan item status - all items are now 'planned' (backlog concept removed) */
export const planItemStatus = z.literal('planned');

});

/** Plan item label - allows any string to support custom labels from Jira */
export const planItemLabel = z.string().max(100, 'Label too long');

/** Relation type */
export const relationType = z.enum(['depends_on', 'blocks', 'relates_to'], {
  message: 'Relation type must be "depends_on", "blocks", or "relates_to"',
});

/** Canvas position (x, y coordinates) */
export const canvasPosition = z.number().int().min(-10000).max(100000);

// =============================================================================
// Path Types
// =============================================================================

/** Absolute file path validation */
export const absolutePath = z
  .string()
  .min(1, 'Path cannot be empty')
  .refine((p) => path.isAbsolute(p), 'Path must be absolute (not relative)');

/** Existing directory path validation */
export const existingDirectoryPath = absolutePath.refine(
  (p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  'Directory does not exist'
);

/** Existing file path validation */
export const existingFilePath = absolutePath.refine(
  (p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  },
  'Source file does not exist'
);

const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

function isSafeRelativePath(input: string): boolean {
  if (input.includes('\0')) {
    return false;
  }

  // Empty path is allowed for APIs that treat it as "project root".
  if (input === '') {
    return true;
  }

  const normalizedInput = input.replace(/\\/g, '/');

  // Reject absolute paths (POSIX and Windows forms).
  if (normalizedInput.startsWith('/') || WINDOWS_DRIVE_PREFIX.test(normalizedInput)) {
    return false;
  }

  // Enforce canonical relative paths (rejects ../, ./, repeated slashes, trailing slash).
  const normalized = path.posix.normalize(normalizedInput);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return false;
  }

  return normalized === normalizedInput;
}

/** Relative path for file explorer */
export const relativePath = z
  .string()
  .max(1000)
  .refine(
    isSafeRelativePath,
    'Path must be a normalized relative path within the project'
  );

// =============================================================================
// Tracker Types
// =============================================================================

/** Jira site URL - hostname format like 'company.atlassian.net' */
export const jiraSiteUrl = z
  .string()
  .min(1, 'Site URL is required')
  .transform((val) => {
    // Strip protocol if provided - we store just the hostname
    if (val.startsWith('https://')) return val.slice(8);
    if (val.startsWith('http://')) return val.slice(7);
    return val;
  })
  .refine(
    (hostname) => {
      // Validate it looks like a valid hostname
      return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(hostname);
    },
    'Site URL must be a valid hostname (e.g., company.atlassian.net)'
  );

/** Email validation */
export const email = z.string().email('Invalid email format');

/** Non-empty API token */
export const apiToken = nonEmptyString('API token');

/** Jira project key (uppercase letters and numbers) */
export const jiraProjectKey = z
  .string()
  .min(1, 'Project key is required')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Project key must be uppercase letters/numbers (e.g., "PROJ", "MY_PROJECT")');

// =============================================================================
// Claude Types
// =============================================================================

/** Claude model selection */
export const claudeModel = z.enum(['opus', 'sonnet'], {
  message: 'Model must be "opus" or "sonnet"',
});

/** Dev session status enum - must match DevSessionStatus in shared/types.ts */
export const devSessionStatus = z.enum(
  ['pending', 'active', 'inactive'],
  { message: 'Status must be one of: pending, active, inactive' }
);

/** Inferred type from Zod schema - structurally identical to DevSessionStatus */
export type DevSessionStatusZod = z.infer<typeof devSessionStatus>;

// =============================================================================
// Misc Types
// =============================================================================

/** Anthropic API key - starts with 'sk-ant-' */
export const anthropicApiKey = z
  .string()
  .min(1, 'API key cannot be empty')
  .refine(
    (key) => key.startsWith('sk-ant-'),
    'Invalid API key format (should start with sk-ant-)'
  );

/** Filename for notes (no path separators allowed) */
export const noteFilename = z.string().min(1).max(255).refine(
  (val) => !val.includes('/') && !val.includes('\\') && !val.startsWith('.'),
  { message: 'Invalid note filename' }
);

/** Supported image MIME types for paste */
export const supportedImageFormat = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
], {
  message: 'Unsupported image format. Supported: PNG, JPEG, GIF, WebP, BMP',
});
