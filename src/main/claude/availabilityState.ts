/**
 * Process-singleton holder for the Claude binary availability probe.
 * Initialized once at startup from main.ts; read by IPC handlers and services
 * without re-walking the filesystem.
 */

import { verifyClaudeAvailability, type ClaudeAvailability } from './findClaude';

let cached: ClaudeAvailability | null = null;

export function initClaudeAvailability(): ClaudeAvailability {
  cached = verifyClaudeAvailability();
  return cached;
}

export function getClaudeAvailability(): ClaudeAvailability {
  if (!cached) {
    cached = verifyClaudeAvailability();
  }
  return cached;
}

export function refreshClaudeAvailability(): ClaudeAvailability {
  cached = verifyClaudeAvailability();
  return cached;
}
