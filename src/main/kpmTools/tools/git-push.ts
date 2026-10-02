/**
 * git_push Tool
 *
 * The user's shell sandbox may deny credential paths and network hosts, so
 * `git push` in Bash can fail to authenticate. This tool performs the push from
 * the main process, where the user's existing git credential helper applies and
 * the agent never sees a secret.
 *
 * `createKpmToolHook` (claude/permissions.ts) auto-allows KPM MCP tools, so this
 * one hands `publishBranch` a `projectWriteGrant` authorization; nothing
 * upstream will ask.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog, projectScoped } from './index';
import type { IRepoRepository } from '../../db/interfaces';
import type { WriteDecision } from '../../chat/writeGrants';
import { resolveCurrentBranch } from '../../services/repo/branchFacts';
import { publishBranch } from '../../services/repo/gitWrites';
import { resolveConnectedRepo } from './connectedRepo';

export interface GitPushConsentRequest {
  remote: string;
  branch: string;
  repoPath: string;
}

interface GitPushToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
  requestWriteAccess: (request: GitPushConsentRequest) => Promise<WriteDecision>;
}

const TOOL_DESCRIPTION = `Push the checked-out branch of a connected repository to its remote, usually so a pull request can be opened. Prefer it to git push in Bash, which may have no network access or credentials. Pushes committed work only, so commit first. The branch is whatever is checked out and cannot be chosen; the first push sets its upstream. Refuses a detached HEAD, the default branch, and main, master, develop, and release. There is no force push: if the remote rejects the push as non-fast-forward, tell the user and let them decide. Asks for the project's publishing grant on first use.`;

export function createGitPushTools(deps: GitPushToolDeps) {
  return [
    tool(
      'git_push',
      TOOL_DESCRIPTION,
      {
        remote: z.string().default('origin').describe('Remote to push to'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.'),
      },
      projectScoped(async ({ projectId, remote, repoPath }) => {
        const resolution = resolveConnectedRepo(deps.repos.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        const branch = await resolveCurrentBranch(cwd);
        toolLog(`[KPM Tools] git_push ${remote} ${branch ?? '(no branch)'} @ ${cwd}`);

        const outcome = await publishBranch({
          repoPath: cwd,
          remote,
          branch,
          authorization: {
            kind: 'projectWriteGrant',
            request: () => deps.requestWriteAccess({ remote, branch: branch ?? '', repoPath: cwd }),
          },
        });

        if (!outcome.ok) {
          return toolError(
            outcome.kind === 'refused'
              ? outcome.reason
              : `Push to ${remote}/${branch} failed.\n${outcome.reason}`
          );
        }

        return jsonResult({
          repoPath: cwd,
          remote,
          branch,
          setUpstream: outcome.setUpstream,
          summary: outcome.summary,
        });
      })
    ),
  ];
}
