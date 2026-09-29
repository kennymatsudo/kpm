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
import { tool, toolResult, toolError, toolLog, projectScoped } from './index';
import type { IRepoRepository } from '../../db/interfaces';
import { gitExecCaptured } from '../../services/repo/gitUtils';
import { READ_GIT_SUBCOMMANDS, classifyGitInvocation } from '../../services/repo/gitReadOnly';
import { resolveConnectedRepoPath } from './connectedRepo';

interface GitReadToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
}

const MAX_OUTPUT_CHARS = 60_000;
const MAX_BUFFER = 10 * 1024 * 1024;

const TOOL_DESCRIPTION = `Run a read-only git command in a connected repository: log, diff, show, status, blame, branch and tag listings, merge-base, rev-parse, and similar. Arguments are passed as a list, one element per shell word, with no pipes or redirects, so nothing depends on shell quoting; limit output with git's own flags (-n, --stat, --name-only). Runs outside the shell sandbox, so it also works when Bash git is refused, and it reaches the network: fetch origin pull/123/head puts a pull request's head at FETCH_HEAD. To read a pull request itself, use read_pull_request.

Commands that write (commit, add, push, checkout, reset, merge, rebase, stash push, branch or tag creation, config set) are rejected, as is fetch with a src:dst refspec. Returns an exit-code line, stderr when there is any, then stdout, cut at ${MAX_OUTPUT_CHARS.toLocaleString()} characters. A non-zero exit is often normal, such as git grep with no match.`;

export function createGitReadTools(deps: GitReadToolDeps) {
  return [
    tool(
      'git_read',
      TOOL_DESCRIPTION,
      {
        operation: z
          .enum(READ_GIT_SUBCOMMANDS)
          .describe('The read-only git subcommand to run (e.g. "log", "diff", "status").'),
        args: z
          .array(z.string())
          .default([])
          .describe('Arguments after the subcommand, one per shell word, e.g. ["--oneline", "-20", "origin/main..HEAD"]'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.'),
      },
      projectScoped(async ({ projectId, operation, args, repoPath }) => {
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
        const header = truncated
          ? `exit ${exitCode}; stdout cut at ${MAX_OUTPUT_CHARS.toLocaleString()} of ${rawStdout.length.toLocaleString()} chars, narrow with git flags`
          : `exit ${exitCode}`;
        const sections = [header];
        if (stderr.trim()) sections.push(`stderr:\n${stderr.trim()}`);
        const stdout = truncated ? rawStdout.slice(0, MAX_OUTPUT_CHARS) : rawStdout;
        if (stdout) sections.push(stderr.trim() ? `stdout:\n${stdout}` : stdout);

        return toolResult(sections.join('\n\n'));
      }),
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
  ];
}
