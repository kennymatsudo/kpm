/**
 * Chat search guard — a PreToolUse hook covering Grep and Glob.
 *
 * `sdkOptionsBuilder` lists Grep and Glob in `allowedTools` so searching a
 * connected repo never raises the write-consent prompt that shelling out to
 * grep/find would. A bare `allowedTools` entry auto-approves the tool *before*
 * `canUseTool` runs, which silently disabled the credential-root deny in
 * `permissions.ts` (Rule 1.5) for exactly these two tools — a recursive search
 * could walk ~/.ssh or ~/.aws. PreToolUse hooks run ahead of that
 * auto-approval, so this restores the deny at the only point that still sees
 * the call.
 *
 * Scope is deliberately just the two shadowed tools: every other tool still
 * reaches `canUseTool` normally, and duplicating more of the permission model
 * here would give the two layers room to drift apart.
 */

import type {
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import {
  pathCanTraverseDeniedRoot,
  pathResolvesIntoDeniedRoot,
} from '../services/files/pathSecurity';

const GUARDED_TOOLS = new Set(['Grep', 'Glob']);

function allow(): HookJSONOutput {
  return { continue: true };
}

function deny(reason: string): HookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Deny a Grep/Glob call that resolves into — or whose recursive walk would
 * cross — a protected credential root. Allows everything else, and fails open
 * on unexpected error so a guard bug can never wedge a chat turn.
 */
export async function evaluateSearchToolCall(input: HookInput): Promise<HookJSONOutput> {
  try {
    if (input.hook_event_name !== 'PreToolUse') return allow();
    if (!GUARDED_TOOLS.has(input.tool_name)) return allow();

    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
    const rawPath = typeof toolInput.path === 'string' && toolInput.path.length > 0
      ? toolInput.path
      // No `path` argument means the search starts at the session cwd.
      : input.cwd;

    if (await pathResolvesIntoDeniedRoot(rawPath, input.cwd)) {
      return deny('Access denied: path resolves inside a protected credential location.');
    }
    if (await pathCanTraverseDeniedRoot(rawPath, input.cwd)) {
      return deny('Access denied: recursive search would traverse a protected credential location.');
    }
    return allow();
  } catch (error) {
    console.warn('[searchGuardHook] guard evaluation failed, allowing tool call:', error);
    return allow();
  }
}

/** PreToolUse matcher wiring the search guard into a chat session's hooks. */
export function createSearchGuardMatcher(): HookCallbackMatcher {
  return {
    hooks: [(input) => evaluateSearchToolCall(input)],
  };
}
