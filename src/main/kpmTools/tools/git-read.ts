/**
 * git_read Tool
 *
 * Runs read-only git commands against a connected repository. Chat's Bash can
 * also run git that `classifyGitShellCommand` proves is read-only (permissions.ts
 * Rule -1); this tool is the structured path, and the only one that works when
 * the shell sandbox is unavailable — or when the command needs the network or
 * the user's credentials, which the sandbox denies Bash outright. It invokes git via execFile
 * (no shell — no pipes, redirects, or command substitution) and validates the
 * subcommand + arguments against `classifyGitInvocation` before running, so the
 * call is read-only by construction rather than by parsing a shell string.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { IRepoRepository } from '../../db/interfaces';
import { gitExecCaptured } from '../../services/repo/gitUtils';
import { READ_GIT_SUBCOMMANDS, classifyGitInvocation } from '../../services/repo/gitReadOnly';
import { resolveConnectedRepoPath } from './connectedRepo';

interface GitReadToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
}

const MAX_OUTPUT_CHARS = 100_000;
const MAX_BUFFER = 10 * 1024 * 1024;

const TOOL_DESCRIPTION = `Run a read-only git command in a connected repository.

## When to use
Inspecting git state: history (\`log\`), changes (\`diff\`, \`show\`), working-tree status (\`status\`), authorship (\`blame\`), branches/tags, \`merge-base\`, \`rev-parse\`, \`rev-list\`, \`for-each-ref\`, etc. Prefer this over Bash for git reads: it takes tokenized arguments, so nothing depends on shell quoting.

## Parameters
- \`projectId\`: The project UUID.
- \`operation\`: The git subcommand, e.g. \`log\`, \`diff\`, \`status\`, \`show\`, \`merge-base\`.
- \`args\`: Remaining git arguments as a tokenized array — one element per shell word (e.g. \`["--oneline", "-20", "origin/main..HEAD"]\`). No pipes, redirects, or shell syntax; git runs directly. To limit output, use git's own flags (\`-n\`, \`--max-count\`, \`--stat\`, \`--name-only\`).
- \`repoPath\`: Absolute path of the connected repo (or a path inside it). Optional when exactly one repo is connected.

## Notes
- Runs outside the shell sandbox, so it is the fallback whenever Bash git is refused: unlike Bash, it reaches the network and your git credentials. A remote ref you do not have yet is one \`fetch\` away — e.g. \`operation: "fetch", args: ["origin", "pull/123/head"]\` puts a pull request's head at \`FETCH_HEAD\`. (To read a PR itself, prefer \`read_pull_request\`.)
- Read-only: writes (commit, add, push, branch/tag creation, merge, rebase, reset, checkout, stash push, config set, ...) are rejected. \`fetch\` is allowed only in non-destructive forms (no \`src:dst\` refspec, which could move a local branch).
- The response includes \`exitCode\`, \`stdout\`, and \`stderr\`. A non-zero \`exitCode\` is often normal (e.g. \`grep\` with no matches), so read the output rather than treating it as failure.
- \`stdout\` is truncated past ${MAX_OUTPUT_CHARS.toLocaleString()} characters; narrow with git flags if you hit that.`;

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
        const resolution = resolveConnectedRepoPath(deps.repos.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        const check = classifyGitInvocation(operation, args);
        if (!check.ok) {
          return toolError(`Read-only git only: ${check.reason}`);
        }

        toolLog(`[KPM Tools] git_read ${operation} ${args.join(' ')} @ ${cwd}`);

        const { stdout: rawStdout, stderr, exitCode } = await gitExecCaptured(
          [operation, ...args],
          { cwd, maxBuffer: MAX_BUFFER }
        );

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
