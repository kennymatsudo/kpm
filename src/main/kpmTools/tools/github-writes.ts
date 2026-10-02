/**
 * GitHub write tools: open a pull request for the checked-out branch, and edit
 * an existing PR's title or body.
 *
 * Like `git_push`, these run `gh` from the main process, so they work even when
 * the user's sandbox cuts chat's shell off from the network and `~/.config/gh`.
 * No provider gates KPM tools, so each call asks for the project's publishing
 * grant itself; nothing upstream will ask.
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog, projectScoped } from './index';
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

const CREATE_DESCRIPTION = `Open a GitHub pull request for the branch checked out in a connected repository, when the user asks to open, create, or raise a PR. Prefer it to gh pr create in Bash, which may have no network or credentials. The branch must already be on the remote, so push it with git_push first. The head is the checked-out branch and cannot be chosen; a detached HEAD, the default branch, and main, master, develop, and release are refused. Opens as a draft unless the user asks for ready for review. Write the body from what you know about the change, following the repo's .github/pull_request_template.md when there is one; call get_pr_context only when the change is not in the conversation. @plan/<uuid> refs become tracker keys. If the branch already has a PR, report it and use update_pull_request instead of retrying. Asks for the project's publishing grant on first use.`;

const UPDATE_DESCRIPTION = `Change the title, the description, or both of an existing GitHub pull request, when the user asks to rename it, write or rewrite its description, or add a ticket to its title. body replaces the whole description, so to change part of it, read the current one first with read_pull_request. @plan/<uuid> refs become tracker keys. Pass at least one of title and body. Asks for the project's publishing grant on first use.`;

const repoPathParam = z
  .string()
  .optional()
  .describe('Absolute path of a connected repo (or a path inside it); optional when exactly one repo is connected');

export function createGitHubWriteTools(deps: GitHubWriteToolDeps) {
  const toGitHubMarkdown = (projectId: string, markdown: string) =>
    toExternalMarkdown(markdown, deps.planItems.getByProject(projectId), 'github');

  return [
    tool(
      'create_pull_request',
      CREATE_DESCRIPTION,
      {
        title: z.string().min(1).describe('PR title'),
        body: z.string().describe('PR description in markdown'),
        base: z.string().min(1).optional().describe('Branch to merge into; defaults to the repo\'s default branch'),
        draft: z.boolean().default(true).describe('Open as a draft; false only when the user asks for ready for review'),
        repoPath: repoPathParam,
      },
      // Defaulted here too, so a caller that skips schema parsing still gets a draft.
      projectScoped(async ({ projectId, title, body, base, draft = true, repoPath }) => {
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
      }),
      { annotations: { openWorldHint: true } }
    ),
    tool(
      'update_pull_request',
      UPDATE_DESCRIPTION,
      {
        pr: z.string().describe('PR URL, "#123", or "123"; a bare number resolves against the connected repo\'s remote'),
        title: z.string().min(1).optional().describe('New title; omit to keep the current one'),
        body: z.string().optional().describe('New description in markdown, replacing the current one; omit to keep it'),
        repoPath: repoPathParam,
      },
      projectScoped(async ({ projectId, pr, title, body, repoPath }) => {
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
      }),
      { annotations: { openWorldHint: true } }
    ),
  ];
}
