/**
 * Board tools: link a task to work that started outside KPM.
 *
 * Nothing here writes. `propose_board_change` runs the same checks as the
 * board's Attach worktree and Link PR menu items, then proposes the fully
 * resolved change; applying it calls those menu items' own service methods.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { tool, jsonResult, toolError, toolLog } from './index';
import type { IPlanItemRepository, IRepoRepository } from '../../db/interfaces';
import type { AsyncResult } from '../../services/result';
import type { AttachWorktreePreview } from '../../services/repo/DevSessionService';
import type { LinkPrPreview } from '../../services/repo/GitHubService';
import type { BoardChange, WorktreeCandidate } from '../../../shared/boardChanges';
import type { Repo } from '../../../shared/types';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';
import { parsePrIdentifier } from '../../services/repo/ghUtils';
import { getCurrentToolExecutionContext } from '../runtime';

export interface BoardToolDeps {
  repos: Pick<IRepoRepository, 'getByProject'>;
  planItems: Pick<IPlanItemRepository, 'get'>;
  listAttachableWorktrees: (repoId: string) => AsyncResult<WorktreeCandidate[]>;
  previewAttachWorktree: (planItemId: string, repoId: string, worktreePath: string) => AsyncResult<AttachWorktreePreview>;
  previewLinkPr: (planItemId: string, repoId: string, prIdentifier: string) => AsyncResult<LinkPrPreview>;
  getRepoSlug: (repoPath: string) => Promise<string>;
  onBoardChange: (change: BoardChange) => void;
}

const LIST_DESCRIPTION = `List the git worktrees of the project's connected repositories, with each one's branch and whether it can be attached to a task.

## When to use
Before \`propose_board_change\` with \`attach_worktree\`, when you need to see what worktrees exist or the user's description of their branch is vague.

## Parameters
- \`repoPath\`: Limit to one connected repo (its path or a path inside it). Omit to list every connected repo.

## Notes
- \`attachable: false\` comes with a \`reason\`: the main checkout, a detached HEAD, a directory that no longer exists, or a worktree another task already owns (\`attachedTo\`).
- Only separate worktrees can be attached. A branch checked out in the main checkout cannot.`;

const PROPOSE_DESCRIPTION = `Propose linking a task to work the user did outside KPM, the same way the board card's Attach worktree and Link PR menu items do.

## When to use
The user says they worked on a task in a branch, worktree, or pull request KPM did not start, and wants the task to track it.

## Changes
- \`attach_worktree\`: attach an existing worktree to the task, giving it an ordinary board session on that branch (Start, Changes, and Create PR then work on it). Pass \`branch\` or \`worktreePath\`; the tool finds the worktree across connected repos. A PR already linked to the task moves onto it when GitHub reports that PR on the branch.
- \`link_pr\`: link an existing pull request to the task. Pass \`pr\` as a number, \`#123\`, or a URL. If the task has a worktree, the PR must be on its branch.

## Parameters
- \`change\`: \`attach_worktree\` or \`link_pr\`.
- \`itemId\`: The task's UUID, from a plan query tool.
- \`branch\` / \`worktreePath\`: Which worktree to attach (\`attach_worktree\` only).
- \`pr\`: The pull request (\`link_pr\` only).
- \`repoPath\`: Which connected repo, when the tool says the request is ambiguous.

## Notes
- A task holds one worktree. Attaching refuses the main checkout, detached HEADs, missing directories, and worktrees another task owns; linking refuses a PR another task has. The error says which, so relay it instead of retrying.
- The change follows the user's review setting: it applies at once with auto-apply on, otherwise it waits in KPM's approval panel.`;

function realDirectory(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

function isWithinDir(target: string, base: string): boolean {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function findRepoByPath(repos: Repo[], requestedPath: string): Repo | undefined {
  const target = realDirectory(requestedPath);
  return repos.find((repo) =>
    isWithinDir(target, realDirectory(repo.path)) || isWithinDir(target, realDirectory(resolveEffectiveRepoPath(repo))));
}

function connectedPaths(repos: Repo[]): string {
  return repos.map((repo) => repo.path).join(', ');
}

function describeUnavailable(candidate: WorktreeCandidate): string {
  if (candidate.unavailableReason === 'Main checkout') {
    return `${candidate.branch ? `Branch ${candidate.branch} is` : 'That is'} checked out in the main checkout at ${candidate.path}, which cannot be attached. Attaching needs a separate worktree; the user can move the branch into one with \`git worktree add\` after switching the main checkout to another branch.`;
  }
  if (candidate.attachedTo) {
    const owner = candidate.attachedTo.title ? `"${candidate.attachedTo.title}"` : 'another task';
    const where = candidate.attachedTo.sameProject ? '' : ' in another project';
    return `The worktree at ${candidate.path} is already attached to ${owner}${where}.`;
  }
  return `The worktree at ${candidate.path} cannot be attached: ${candidate.unavailableReason}.`;
}

export function createBoardTools(deps: BoardToolDeps) {
  const projectRepos = (): { projectId: string; repos: Repo[] } | { error: string } => {
    const projectId = getCurrentToolExecutionContext()?.projectId;
    if (!projectId) return { error: 'No project is active for this chat.' };
    const repos = deps.repos.getByProject(projectId);
    if (repos.length === 0) return { error: 'No repositories are connected to this project.' };
    return { projectId, repos };
  };

  const scopeRepos = (repos: Repo[], repoPath: string | undefined): Repo[] | { error: string } => {
    if (!repoPath) return repos;
    const match = findRepoByPath(repos, repoPath);
    return match ? [match] : { error: `"${repoPath}" is not within a connected repository. Connected: ${connectedPaths(repos)}` };
  };

  async function proposeAttach(params: {
    itemId: string;
    repos: Repo[];
    branch?: string;
    worktreePath?: string;
  }) {
    const { itemId, repos, branch, worktreePath } = params;
    if (!branch && !worktreePath) return toolError('attach_worktree needs branch or worktreePath.');
    const wantedDir = worktreePath ? realDirectory(worktreePath) : null;

    const matches: { repo: Repo; candidate: WorktreeCandidate }[] = [];
    for (const repo of repos) {
      const listed = await deps.listAttachableWorktrees(repo.id);
      if (!listed.ok) return toolError(`Could not list worktrees of ${repo.path}: ${listed.error}`);
      for (const candidate of listed.data) {
        const pathMatches = wantedDir === null || realDirectory(candidate.path) === wantedDir;
        const branchMatches = !branch || candidate.branch === branch;
        if (pathMatches && branchMatches) matches.push({ repo, candidate });
      }
    }

    if (matches.length === 0) {
      const what = worktreePath
        ? `No worktree at ${worktreePath}${branch ? ` with branch ${branch}` : ''}`
        : `No worktree has branch ${branch} checked out`;
      return toolError(`${what} in ${connectedPaths(repos)}. Only separate worktrees can be attached; call list_worktrees to see them.`);
    }
    if (matches.length > 1) {
      return toolError(`Branch ${branch} is checked out in more than one connected repo: ${matches.map((match) => match.candidate.path).join(', ')}. Pass repoPath or worktreePath.`);
    }

    const [{ repo, candidate }] = matches;
    if (candidate.unavailableReason) return toolError(describeUnavailable(candidate));

    const preview = await deps.previewAttachWorktree(itemId, repo.id, candidate.path);
    if (!preview.ok) return toolError(preview.error);

    const change: BoardChange = {
      kind: 'attach_worktree',
      planItemId: itemId,
      itemTitle: preview.data.item.title,
      repoId: repo.id,
      repoPath: repo.path,
      worktreePath: preview.data.worktreePath,
      branchName: preview.data.branchName,
      carriedPrNumber: preview.data.carriedPr?.pr_number ?? null,
    };
    deps.onBoardChange(change);
    return jsonResult({
      proposalSubmitted: true,
      change: change.kind,
      task: change.itemTitle,
      worktreePath: change.worktreePath,
      branch: change.branchName,
      ...(change.carriedPrNumber ? { carriesLinkedPr: change.carriedPrNumber } : {}),
      status: 'Submitted to KPM. It applies at once if the user has auto-apply on; otherwise it waits for their review.',
    });
  }

  async function resolveLinkRepo(repos: Repo[], pr: string): Promise<Repo | { error: string }> {
    if (repos.length === 1) return repos[0];
    const parsed = parsePrIdentifier(pr);
    if (parsed?.repo) {
      const urlSlug = `${parsed.repo.owner}/${parsed.repo.name}`.toLowerCase();
      for (const repo of repos) {
        const slug = await deps.getRepoSlug(repo.path).catch(() => null);
        if (slug?.toLowerCase() === urlSlug) return repo;
      }
      return { error: `No connected repository is ${urlSlug}. Connected: ${connectedPaths(repos)}` };
    }
    return { error: `Multiple repositories are connected. Pass repoPath, or pr as a URL. Connected: ${connectedPaths(repos)}` };
  }

  async function proposeLink(params: { itemId: string; repos: Repo[]; pr?: string }) {
    const { itemId, repos, pr } = params;
    if (!pr) return toolError('link_pr needs pr.');
    const repo = await resolveLinkRepo(repos, pr);
    if ('error' in repo) return toolError(repo.error);

    const preview = await deps.previewLinkPr(itemId, repo.id, pr);
    if (!preview.ok) return toolError(preview.error);
    const { item, session, pr: status } = preview.data;
    if (session?.pr_number === status.number) {
      return toolError(`PR #${status.number} is already linked to this task.`);
    }

    const change: BoardChange = {
      kind: 'link_pr',
      planItemId: itemId,
      itemTitle: item.title,
      repoId: repo.id,
      repoPath: repo.path,
      prNumber: status.number,
      prUrl: status.url,
      prTitle: status.title ?? null,
      prHeadBranch: status.headRefName ?? null,
      sessionBranch: session?.worktree_path ? session.branch_name || null : null,
      replacesPrNumber: session?.pr_number ?? null,
    };
    deps.onBoardChange(change);
    return jsonResult({
      proposalSubmitted: true,
      change: change.kind,
      task: change.itemTitle,
      pr: `#${change.prNumber}`,
      ...(change.replacesPrNumber ? { replaces: `#${change.replacesPrNumber}` } : {}),
      status: 'Submitted to KPM. It applies at once if the user has auto-apply on; otherwise it waits for their review.',
    });
  }

  return [
    tool(
      'list_worktrees',
      LIST_DESCRIPTION,
      {
        repoPath: z.string().optional().describe('Limit to one connected repo; omit for all'),
      },
      async ({ repoPath }) => {
        const scope = projectRepos();
        if ('error' in scope) return toolError(scope.error);
        const repos = scopeRepos(scope.repos, repoPath);
        if ('error' in repos) return toolError(repos.error);

        const listing = [];
        for (const repo of repos) {
          const listed = await deps.listAttachableWorktrees(repo.id);
          if (!listed.ok) return toolError(`Could not list worktrees of ${repo.path}: ${listed.error}`);
          listing.push({
            repoPath: repo.path,
            worktrees: listed.data.map((candidate) => ({
              path: candidate.path,
              branch: candidate.branch,
              attachable: !candidate.unavailableReason,
              ...(candidate.unavailableReason ? { reason: candidate.unavailableReason } : {}),
              ...(candidate.attachedTo ? { attachedTo: { itemId: candidate.attachedTo.planItemId, title: candidate.attachedTo.title } } : {}),
            })),
          });
        }
        return jsonResult({ repos: listing });
      },
    ),
    tool(
      'propose_board_change',
      PROPOSE_DESCRIPTION,
      {
        change: z.enum(['attach_worktree', 'link_pr']).describe('"attach_worktree" or "link_pr"'),
        itemId: z.string().uuid().describe('The task UUID'),
        branch: z.string().min(1).optional().describe('attach_worktree: branch checked out in the worktree'),
        worktreePath: z.string().min(1).optional().describe('attach_worktree: absolute path of the worktree'),
        pr: z.string().min(1).optional().describe('link_pr: PR number, #123, or URL'),
        repoPath: z.string().optional().describe('Connected repo to use when the request is ambiguous'),
      },
      async ({ change, itemId, branch, worktreePath, pr, repoPath }) => {
        const scope = projectRepos();
        if ('error' in scope) return toolError(scope.error);
        const item = deps.planItems.get(itemId);
        if (item?.project_id !== scope.projectId) return toolError(`No task ${itemId} in this project.`);
        const repos = scopeRepos(scope.repos, repoPath);
        if ('error' in repos) return toolError(repos.error);

        toolLog(`[KPM Tools] propose_board_change ${change} ${itemId}`);
        return change === 'attach_worktree'
          ? proposeAttach({ itemId, repos, branch, worktreePath })
          : proposeLink({ itemId, repos, pr });
      },
    ),
  ];
}
