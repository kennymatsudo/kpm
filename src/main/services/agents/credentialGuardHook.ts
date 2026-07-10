/**
 * Board-agent credential guard — a PreToolUse hook for Claude board sessions.
 *
 * Board sessions run with `permissionMode: 'bypassPermissions'`, which skips the
 * `canUseTool` callback entirely (permission checks are bypassed at that step).
 * PreToolUse hooks, however, run before permission-mode evaluation and a hook
 * `deny` applies even under bypassPermissions — so they are the only
 * non-interactive enforcement point available to a board run.
 *
 * The guard is deliberately narrow: board agents legitimately need broad
 * Bash/write/git access, so this only denies access a coding agent never needs —
 * reading the user's credential files (~/.ssh, ~/.aws, keychains, …) and writing
 * executable git hooks (which would turn "write a file" into "run code on the
 * next commit"). Everything else is allowed; it never prompts.
 */

import os from 'os';
import path from 'path';
import type {
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import {
  defaultDeniedRoots,
  expandTilde,
  getDeniedRealpathRootsAsync,
  isGitHooksPath,
  pathResolvesIntoDeniedRoot,
} from '../files/pathSecurity';

/** Tools whose path argument is checked against the credential denylist. */
const PATH_ARG_BY_TOOL: Record<string, (input: Record<string, unknown>) => unknown> = {
  Read: (i) => i.file_path,
  Edit: (i) => i.file_path,
  Write: (i) => i.file_path,
  MultiEdit: (i) => i.file_path,
  NotebookEdit: (i) => i.notebook_path,
  Grep: (i) => i.path,
  Glob: (i) => i.path,
};

/** Tools that create/modify a file — also blocked from writing git hooks. */
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

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
 * True when a shell command literally references one of the denied credential
 * roots (after expanding `~`, `$HOME`, and `${HOME}`). A coding task never needs
 * to touch these locations, so the false-positive risk is negligible; obfuscated
 * variants are out of scope for this defense-in-depth layer.
 */
async function commandReferencesDeniedRoot(command: string): Promise<boolean> {
  const home = os.homedir();
  const normalized = command
    .replaceAll('${HOME}', home)
    .replaceAll('$HOME', home)
    .replaceAll('~/', home + path.sep);

  const roots = new Set<string>([
    ...(await getDeniedRealpathRootsAsync()),
    ...defaultDeniedRoots(),
  ]);
  for (const root of roots) {
    if (root && normalized.includes(root)) return true;
  }
  return false;
}

/**
 * Decide whether a board tool call may proceed. Denies credential-root access
 * and git-hook writes; allows everything else. Fails open on unexpected error
 * so a non-interactive board run is never broken by the guard.
 */
export async function evaluateBoardToolCall(
  input: HookInput,
  options: { readOnly?: boolean } = {},
): Promise<HookJSONOutput> {
  try {
    if (input.hook_event_name !== 'PreToolUse') return allow();
    const pre = input;
    const shortName = pre.tool_name.replace(/^mcp__\w+__/, '');
    const toolInput = (pre.tool_input ?? {}) as Record<string, unknown>;
    const cwd = pre.cwd;

    if (shortName === 'Bash') {
      const command = typeof toolInput.command === 'string' ? toolInput.command : '';
      if (options.readOnly && /(?:^|[;&|]\s*)(?:rm|mv|cp|touch|mkdir|rmdir|chmod|chown|git\s+(?:add|commit|checkout|switch|reset|clean|rebase|merge)|sed\s+-i|tee)\b|(?:^|[^<])>{1,2}(?!>)/i.test(command)) {
        return deny('This subagent step is read-only. Enable file editing on the step to allow writes.');
      }
      if (command && (await commandReferencesDeniedRoot(command))) {
        return deny('Reading credential files is not permitted for board agents.');
      }
      return allow();
    }

    if (options.readOnly && WRITE_TOOLS.has(shortName)) {
      return deny('This subagent step is read-only. Enable file editing on the step to allow writes.');
    }

    const getPathArg = PATH_ARG_BY_TOOL[shortName];
    if (!getPathArg) return allow();

    const rawPath = getPathArg(toolInput);
    if (typeof rawPath !== 'string' || rawPath.length === 0) return allow();

    if (await pathResolvesIntoDeniedRoot(rawPath, cwd)) {
      return deny('Access to credential files is not permitted for board agents.');
    }

    if (WRITE_TOOLS.has(shortName)) {
      const expanded = expandTilde(rawPath);
      const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
      if (isGitHooksPath(absolute)) {
        return deny('Writing git hooks is not permitted for board agents.');
      }
    }

    return allow();
  } catch (error) {
    console.warn('[credentialGuardHook] guard evaluation failed, allowing tool call:', error);
    return allow();
  }
}

/** PreToolUse matcher wiring the guard into a board Claude session's hooks. */
export function createCredentialGuardMatcher(options: { readOnly?: boolean } = {}): HookCallbackMatcher {
  return {
    hooks: [(input) => evaluateBoardToolCall(input, options)],
  };
}
