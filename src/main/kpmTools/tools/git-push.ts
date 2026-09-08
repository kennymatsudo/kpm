/**
 * git_push Tool
 *
 * Chat's shell runs in a sandbox that denies the credential paths and every host
 * except localhost, so `git push` there can never authenticate to a remote. This
 * tool performs the push from the main process, where the user's existing git
 * credential helper applies and the agent never sees a secret.
 *
 * KPM MCP tools are auto-allowed by `canUseTool`, so this one hands
 * `publishBranch` a `projectWriteGrant` authorization; nothing upstream will ask.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { IRepoRepository } from '../../db/interfaces';
import type { WriteDecision } from '../../chat/writeGrants';
import { resolveCurrentBranch } from '../../services/repo/branchFacts';
import { publishBranch } from '../../services/repo/gitWrites';
import { resolveConnectedRepoPath } from './connectedRepo';

export interface GitPushConsentRequest {
  remote: string;
  branch: string;
  repoPath: string;
}

interface GitPushToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
  requestWriteAccess: (request: GitPushConsentRequest) => Promise<WriteDecision>;
}

const TOOL_DESCRIPTION = `Push the currently checked-out branch of a connected repository to its remote.

## When to use
Publishing commits that already exist locally, usually so a pull request can be opened. \`git push\` in Bash cannot work — chat's shell has no network access and no credentials — so this is the only push path.

## Parameters
- \`projectId\`: The project UUID.
- \`remote\`: Remote name. Defaults to \`origin\`.
- \`repoPath\`: Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.

## Notes
- Pushes the branch that is checked out and nothing else; the branch and refspec are not selectable.
- Sets the upstream automatically the first time a branch is pushed.
- Refuses a detached HEAD, the repository's default branch, and main/master/develop/release.
- There is no force push. If the remote rejects the push as non-fast-forward, report it and let the user decide — do not try to work around it.
- Needs the conversation's write access, requested on first use.
- Pushes committed work only. Commit first, then push.`;

export function createGitPushTools(deps: GitPushToolDeps) {
  return [
    tool(
      'git_push',
      TOOL_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        remote: z.string().default('origin').describe('Remote to push to. Defaults to "origin".'),
        repoPath: z
          .string()
          .optional()
          .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.'),
      },
      async ({ projectId, remote, repoPath }) => {
        const resolution = resolveConnectedRepoPath(deps.repos.getByProject(projectId), repoPath);
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
      }
    ),
  ];
}
