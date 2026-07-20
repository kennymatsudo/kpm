/**
 * git_read Tool
 *
 * Runs read-only git commands against a connected repository. Chat has no raw
 * git access in Bash; this is the only git path. It invokes git via execFile
 * (no shell — no pipes, redirects, or command substitution) and validates the
 * subcommand + arguments against `classifyGitInvocation` before running, so the
 * call is read-only by construction rather than by parsing a shell string.
 */

import { z } from 'zod';
import path from 'path';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { IRepoRepository } from '../../db/interfaces';
import { gitExec } from '../../services/repo/gitUtils';
import { READ_GIT_SUBCOMMANDS, classifyGitInvocation } from '../../services/repo/gitReadOnly';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';

interface GitReadToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
}

const MAX_OUTPUT_CHARS = 100_000;
const MAX_BUFFER = 10 * 1024 * 1024;

const TOOL_DESCRIPTION = `Run a read-only git command in a connected repository.

## When to use
Inspecting git state: history (\`log\`), changes (\`diff\`, \`show\`), working-tree status (\`status\`), authorship (\`blame\`), branches/tags, \`merge-base\`, \`rev-parse\`, \`rev-list\`, \`for-each-ref\`, etc. This is the only way to run git in chat — raw \`git\` in Bash is blocked.

## Parameters
- \`projectId\`: The project UUID.
- \`operation\`: The git subcommand, e.g. \`log\`, \`diff\`, \`status\`, \`show\`, \`merge-base\`.
- \`args\`: Remaining git arguments as a tokenized array — one element per shell word (e.g. \`["--oneline", "-20", "origin/main..HEAD"]\`). No pipes, redirects, or shell syntax; git runs directly. To limit output, use git's own flags (\`-n\`, \`--max-count\`, \`--stat\`, \`--name-only\`).
- \`repoPath\`: Absolute path of the connected repo (or a path inside it). Optional when exactly one repo is connected.

## Notes
- Read-only: writes (commit, add, push, branch/tag creation, merge, rebase, reset, checkout, stash push, config set, ...) are rejected. \`fetch\` is allowed only in non-destructive forms.
- The response includes \`exitCode\`, \`stdout\`, and \`stderr\`. A non-zero \`exitCode\` is often normal (e.g. \`grep\` with no matches), so read the output rather than treating it as failure.
- \`stdout\` is truncated past ${MAX_OUTPUT_CHARS.toLocaleString()} characters; narrow with git flags if you hit that.`;

function isWithinDir(target: string, base: string): boolean {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Run git and capture output. A non-zero exit is normal for many read commands
 * (grep with no matches = 1, diff --exit-code, merge-base with no ancestor = 1),
 * so the exit code and captured output are returned rather than thrown.
 */
async function runGit(
  operation: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await gitExec([operation, ...args], { cwd, maxBuffer: MAX_BUFFER });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: unknown; message?: string };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? String(error),
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

export function createGitReadTools(deps: GitReadToolDeps) {
  return [
    tool(
      'git_read',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        operation: z
          .enum(READ_GIT_SUBCOMMANDS)
          .describe('The read-only git subcommand to run (e.g. "log", "diff", "status").'),
        args: z
          .array(z.string())
          .default([])
          .describe('Git arguments after the operation, tokenized one-per-word. No shell syntax.'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.'),
      },
      async ({ projectId, operation, args, repoPath }) => {
        const repos = deps.repos.getByProject(projectId);
        if (repos.length === 0) {
          return toolError('No repositories are connected to this project.');
        }

        const effectivePathOf = (r: { path: string; active_worktree_path?: string | null }) =>
          path.resolve(resolveEffectiveRepoPath(r));

        let cwd: string;
        if (repoPath) {
          const resolved = path.resolve(repoPath);
          const match = repos.find((r) => isWithinDir(resolved, effectivePathOf(r)));
          if (!match) {
            return toolError(
              `"${repoPath}" is not within a connected repository. Connected: ${repos.map(effectivePathOf).join(', ')}`
            );
          }
          cwd = resolved;
        } else if (repos.length === 1) {
          cwd = effectivePathOf(repos[0]);
        } else {
          return toolError(
            `Multiple repositories are connected — pass repoPath. Options: ${repos.map(effectivePathOf).join(', ')}`
          );
        }

        const check = classifyGitInvocation(operation, args);
        if (!check.ok) {
          return toolError(`Read-only git only: ${check.reason}`);
        }

        toolLog(`[KPM Tools] git_read ${operation} ${args.join(' ')} @ ${cwd}`);

        const { stdout: rawStdout, stderr, exitCode } = await runGit(operation, args, cwd);

        const truncated = rawStdout.length > MAX_OUTPUT_CHARS;
        const stdout = truncated
          ? rawStdout.slice(0, MAX_OUTPUT_CHARS) + '\n... (output truncated)'
          : rawStdout;

        return jsonResult({
          operation,
          repoPath: cwd,
          exitCode,
          stdout,
          ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
          truncated,
        });
      }
    ),
  ];
}
