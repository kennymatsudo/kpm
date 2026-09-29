/**
 * GitHub write tools: open a pull request for the checked-out branch, and edit
 * an existing PR's title or body.
 *
 * Like `git_push`, these run `gh` from the main process because chat's shell is
 * sandboxed away from the network and `~/.config/gh`. KPM MCP tools are
 * auto-allowed by `canUseTool`, so each call asks for the project's write grant
 * itself; nothing upstream will ask.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { IPlanItemRepository, IRepoRepository } from '../../db/interfaces';
import type { WriteDecision } from '../../chat/writeGrants';
import { getConfig } from '../../config';
import { toExternalMarkdown } from '../../documents/exportBoundary';
import { classifyPushTarget, resolveCurrentBranch, resolveDefaultBranch } from '../../services/repo/branchFacts';
import {
  GhTimeoutError,
  createPr,
  describeGhFailure,
  editPr,
  getPrForBranch,
  isBranchPushed,
  parsePrRef,
} from '../../services/repo/ghUtils';
import { resolveConnectedRepoPath } from './connectedRepo';

export interface PullRequestWriteRequest {
  action: 'create' | 'edit';
  /** The head branch for a create, the PR reference for an edit. */
  target: string;
  repoPath: string;
}

interface GitHubWriteToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
  planItems: Pick<IPlanItemRepository, 'getByProject'>;
  requestWriteAccess: (request: PullRequestWriteRequest) => Promise<WriteDecision>;
}

const CREATE_DESCRIPTION = `Open a pull request on GitHub for the branch checked out in a connected repository.

## When to use
The user asks to open, create, or raise a PR. \`gh pr create\` in Bash cannot work — chat's shell has no network access and no credentials — so this is the only way.

## Parameters
- \`projectId\`: The project UUID.
- \`title\`: PR title.
- \`body\`: PR description in markdown. Follow the repo's PR template if it has one (\`.github/pull_request_template.md\`). Write it from what you already know about the change; call \`generate_pr_description\` only when you do not have the change in context, since it returns up to 80,000 characters of diff. \`@plan/<uuid>\` refs are rewritten to their tracker keys.
- \`base\`: Branch to merge into. Defaults to the repository's default branch.
- \`draft\`: Open as a draft (default true). Set false only when the user asks for a ready-for-review PR.
- \`repoPath\`: Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.

## Notes
- Uses the checked-out branch as the head; it is not selectable. Refuses a detached HEAD, the default branch, and main/master/develop/release.
- The branch must already be on the remote. Push it with \`git_push\` first.
- Needs the project's write grant, requested on first use.
- If the branch already has a PR, report it and use \`update_pull_request\` instead of retrying.`;

const UPDATE_DESCRIPTION = `Change the title and/or description of an existing pull request on GitHub.

## When to use
The user asks to rename a PR, fill in or rewrite its description, or add a ticket to its title. \`body\` replaces the whole description, so when only part of it should change, read the current one first with \`read_pull_request\` and \`includeDiff: false\`.

## Parameters
- \`projectId\`: The project UUID.
- \`pr\`: PR URL, \`#123\`, or \`123\`. A bare number resolves against the connected repo's remote.
- \`title\`: New title. Omit to keep the current one.
- \`body\`: New description in markdown, replacing the current one. Omit to keep it. \`@plan/<uuid>\` refs are rewritten to their tracker keys.
- \`repoPath\`: Absolute path of a connected repo to run from. Optional when exactly one repo is connected.

## Notes
- Pass at least one of \`title\` and \`body\`.
- Needs the project's write grant, requested on first use.`;

const repoPathParam = z
  .string()
  .optional()
  .describe('Absolute path of a connected repo (or a path inside it). Optional when exactly one repo is connected.');

export function createGitHubWriteTools(deps: GitHubWriteToolDeps) {
  const toGitHubMarkdown = (projectId: string, markdown: string) =>
    toExternalMarkdown(markdown, deps.planItems.getByProject(projectId), 'github');

  return [
    tool(
      'create_pull_request',
      CREATE_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        title: z.string().min(1).describe('PR title.'),
        body: z.string().describe('PR description in markdown.'),
        base: z.string().min(1).optional().describe('Branch to merge into; defaults to the repo default branch.'),
        draft: z.boolean().default(true).describe('Open as a draft.'),
        repoPath: repoPathParam,
      },
      async ({ projectId, title, body, base, draft, repoPath }) => {
        const resolution = resolveConnectedRepoPath(deps.repos.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        const headCheck = await classifyPushTarget(cwd, await resolveCurrentBranch(cwd));
        if (!headCheck.ok) return toolError(headCheck.reason);
        const head = headCheck.branch;

        if (!(await isBranchPushed(cwd, head))) {
          return toolError(`"${head}" is not on origin yet. Push it with git_push, then create the PR.`);
        }

        const baseBranch = base ?? (await resolveDefaultBranch(cwd));
        if (baseBranch === head) {
          return toolError(`Head and base are both "${head}". Pass a different base.`);
        }

        toolLog(`[KPM Tools] create_pull_request ${head} -> ${baseBranch} @ ${cwd}`);

        const decision = await deps.requestWriteAccess({ action: 'create', target: head, repoPath: cwd });
        if (!decision.allowed) return toolError(decision.reason);

        try {
          const created = await createPr(cwd, {
            head,
            base: baseBranch,
            title: toGitHubMarkdown(projectId, title),
            body: toGitHubMarkdown(projectId, body),
            draft,
          }, getConfig().agentSession.prCreateTimeoutMs).catch(async (error: unknown) => {
            // GitHub often accepts the create just before the kill; a retry would then fail on "already exists".
            if (!(error instanceof GhTimeoutError)) throw error;
            const landed = await getPrForBranch(cwd, head);
            if (landed?.state !== 'OPEN') throw error;
            return { number: landed.number, url: landed.url };
          });
          return jsonResult({ success: true, ...created, head, base: baseBranch, draft });
        } catch (error) {
          return toolError(await describeGhFailure(cwd, error));
        }
      },
      { annotations: { openWorldHint: true } }
    ),
    tool(
      'update_pull_request',
      UPDATE_DESCRIPTION,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        pr: z.string().describe('PR URL, "#123", or "123".'),
        title: z.string().min(1).optional().describe('New title.'),
        body: z.string().optional().describe('New description, replacing the current one.'),
        repoPath: repoPathParam,
      },
      async ({ projectId, pr, title, body, repoPath }) => {
        if (title === undefined && body === undefined) {
          return toolError('Nothing to change: pass title, body, or both.');
        }

        const resolution = resolveConnectedRepoPath(deps.repos.getByProject(projectId), repoPath);
        if (!resolution.ok) return toolError(resolution.reason);
        const cwd = resolution.repoPath;

        const prRef = parsePrRef(pr);
        if (!prRef) {
          return toolError(`"${pr}" is not a PR number or a github.com pull request URL.`);
        }

        toolLog(`[KPM Tools] update_pull_request ${prRef} @ ${cwd}`);

        const decision = await deps.requestWriteAccess({ action: 'edit', target: prRef, repoPath: cwd });
        if (!decision.allowed) return toolError(decision.reason);

        try {
          await editPr(cwd, prRef, {
            title: title === undefined ? undefined : toGitHubMarkdown(projectId, title),
            body: body === undefined ? undefined : toGitHubMarkdown(projectId, body),
          });
          return jsonResult({ success: true, pr: prRef, updated: { title: title !== undefined, body: body !== undefined } });
        } catch (error) {
          return toolError(await describeGhFailure(cwd, error));
        }
      },
      { annotations: { openWorldHint: true } }
    ),
  ];
}
