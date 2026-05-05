/* eslint-disable @typescript-eslint/require-await */
/**
 * Review Assessment Tools
 *
 * Read-only MCP server used by ReviewAssessmentService. Lets the assessment
 * agent look beyond the PR diff + linked plan item before landing a
 * disposition: KPM plan items, KPM project docs, and branches across every
 * repo on the project (including WIP branches that may already address or
 * defer a reviewer's concern).
 *
 * No mutations — everything here is a read. No emitters, no approval flow.
 */

import { z } from 'zod';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { tool, jsonResult, toolError } from './index';
import type { IPlanItemRepository, IPlanRelationRepository, IRepoRepository } from '../../db/interfaces';
import type { FileExplorerService } from '../../services/files/FileExplorerService';
import { gitExec, detectBaseBranch } from '../../services/repo/gitUtils';

export interface ReviewAssessmentToolsDeps {
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  repos: IRepoRepository;
  fileExplorerService: FileExplorerService;
}

const MAX_BRANCHES_PER_REPO = 40;
const MAX_COMMITS_PER_BRANCH = 25;
const MAX_DOCUMENT_CHARS = 40_000;

interface BranchSummary {
  branch: string;
  headSubject: string;
  lastCommitIso: string;
  author: string;
  aheadOfBase: number | null;
  behindBase: number | null;
}

interface RepoBranchBlock {
  repoId: string;
  repoPath: string;
  baseBranch: string;
  branches: BranchSummary[];
  truncated: boolean;
  error?: string;
}

async function listBranchesForRepo(
  repoId: string,
  repoPath: string
): Promise<RepoBranchBlock> {
  const baseBranch = await detectBaseBranch(repoPath);

  // Format: refname|subject|committerdate-iso-strict|author
  const { stdout } = await gitExec(
    [
      'for-each-ref',
      `--sort=-committerdate`,
      `--format=%(refname:short)|%(subject)|%(committerdate:iso-strict)|%(authorname)`,
      'refs/heads',
    ],
    { cwd: repoPath }
  );

  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  const truncated = lines.length > MAX_BRANCHES_PER_REPO;
  const scoped = lines.slice(0, MAX_BRANCHES_PER_REPO);

  const branches: BranchSummary[] = [];
  for (const line of scoped) {
    const [branch, headSubject = '', lastCommitIso = '', author = ''] = line.split('|');
    if (!branch || branch === baseBranch) continue;

    let aheadOfBase: number | null = null;
    let behindBase: number | null = null;
    try {
      const { stdout: counts } = await gitExec(
        ['rev-list', '--left-right', '--count', `${baseBranch}...${branch}`],
        { cwd: repoPath }
      );
      const [behind, ahead] = counts.trim().split(/\s+/).map((n) => parseInt(n, 10));
      behindBase = Number.isFinite(behind) ? behind : null;
      aheadOfBase = Number.isFinite(ahead) ? ahead : null;
    } catch {
      // Branch may be unrelated to base; leave counts null.
    }

    branches.push({ branch, headSubject, lastCommitIso, author, aheadOfBase, behindBase });
  }

  return { repoId, repoPath, baseBranch, branches, truncated };
}

export function createReviewAssessmentTools(deps: ReviewAssessmentToolsDeps) {
  return [
    tool(
      'list_project_branches',
      `List local git branches across every repo connected to the project (not just the PR's repo). Use this to check whether reviewer concerns are being addressed by in-flight work that isn't yet in main — including work on a sibling repo. Returns up to ${MAX_BRANCHES_PER_REPO} most-recent branches per repo with subject line, date, author, and ahead/behind counts versus the repo's default branch. Follow up with get_branch_activity on anything promising.`,
      {
        projectId: z.string().uuid().describe('The project UUID'),
      },
      async ({ projectId }) => {
        try {
          const repos = deps.repos.getByProject(projectId);
          if (repos.length === 0) {
            return jsonResult({ repos: [] });
          }

          const blocks: RepoBranchBlock[] = [];
          for (const repo of repos) {
            try {
              blocks.push(await listBranchesForRepo(repo.id, repo.path));
            } catch (error) {
              blocks.push({
                repoId: repo.id,
                repoPath: repo.path,
                baseBranch: '',
                branches: [],
                truncated: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          return jsonResult({ repos: blocks });
        } catch (error) {
          return toolError(`list_project_branches failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'get_branch_activity',
      `Inspect a specific branch in a specific repo. Returns the commits between the base branch and the tip, the files each commit touched, and a short diffstat. Use this to confirm whether a branch is actually addressing a reviewer's concern before citing it in a disposition. Returns up to ${MAX_COMMITS_PER_BRANCH} commits.`,
      {
        repoId: z.string().uuid().describe('The repo UUID (from list_project_branches)'),
        branch: z.string().describe('Branch name (e.g., "feature/foo" — from list_project_branches)'),
      },
      async ({ repoId, branch }) => {
        try {
          const repo = deps.repos.getById(repoId);
          if (!repo) return toolError(`Repo not found: ${repoId}`);

          const baseBranch = await detectBaseBranch(repo.path);

          // Validate branch exists to avoid injecting refs
          try {
            await gitExec(['rev-parse', '--verify', `refs/heads/${branch}`], { cwd: repo.path });
          } catch {
            return toolError(`Branch not found in repo ${repo.path}: ${branch}`);
          }

          const { stdout: logStdout } = await gitExec(
            [
              'log',
              `${baseBranch}..${branch}`,
              `--max-count=${MAX_COMMITS_PER_BRANCH}`,
              '--pretty=format:__COMMIT__%n%H%n%an%n%ad%n%s',
              '--name-only',
              '--date=iso-strict',
            ],
            { cwd: repo.path, maxBuffer: 4 * 1024 * 1024 }
          );

          const commits: { hash: string; author: string; date: string; subject: string; files: string[] }[] = [];
          const chunks = logStdout.split('__COMMIT__\n').slice(1);
          for (const chunk of chunks) {
            const lines = chunk.split('\n');
            const [hash, author, date, subject, ...rest] = lines;
            const files = rest.filter((l) => l.trim().length > 0);
            commits.push({ hash, author, date, subject, files });
          }

          const { stdout: diffStat } = await gitExec(
            ['diff', '--stat', `${baseBranch}...${branch}`],
            { cwd: repo.path, maxBuffer: 2 * 1024 * 1024 }
          );

          return jsonResult({
            repoId,
            repoPath: repo.path,
            branch,
            baseBranch,
            commitCount: commits.length,
            commits,
            diffstat: diffStat.trim(),
          });
        } catch (error) {
          return toolError(`get_branch_activity failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'list_plan_items',
      `Search KPM plan items in this project to check whether a reviewer concern is already captured as a follow-up task. Returns title, status_category, label, release_tag, external_key, and parent_id. A non-null external_key (e.g., "PROJ-7012") is safe to cite in a draft GitHub reply; the KPM-local \`id\` is NOT.`,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        search: z.string().optional().describe('Case-insensitive substring match on title'),
        statusCategory: z
          .optional()
          .describe('Filter by status category'),
        label: z.enum(['project', 'feature', 'task']).optional().describe('Filter by label'),
      },
      async ({ projectId, search, statusCategory, label }) => {
        try {
          const items = deps.planItems.getByProject(projectId);
          const filtered = items.filter((i) => {
            if (statusCategory && i.status_category !== statusCategory) return false;
            if (label && i.label !== label) return false;
            if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
          });

          return jsonResult({
            count: filtered.length,
            items: filtered.slice(0, 100).map((i) => ({
              id: i.id,
              title: i.title,
              parent_id: i.parent_id,
              status: i.status,
              status_category: i.status_category,
              label: i.label,
              release_tag: i.release_tag,
              external_key: i.external_key,
            })),
            truncated: filtered.length > 100,
          });
        } catch (error) {
          return toolError(`list_plan_items failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'get_plan_item',
      `Fetch a single plan item with its description, intent, acceptance_criteria, parent title, children, and dependency edges (blockedBy / blocks / relatedTo). Use after list_plan_items to confirm that a candidate follow-up really covers the reviewer's concern. When citing it in a draft reply, use external_key (e.g., Jira key) or the title — never the internal \`id\`.`,
      {
        itemId: z.string().uuid().describe('The plan item UUID'),
      },
      async ({ itemId }) => {
        try {
          const item = deps.planItems.get(itemId);
          if (!item) return toolError(`Plan item not found: ${itemId}`);
          if (!item.project_id) return toolError(`Plan item has no project_id: ${itemId}`);

          const parent = item.parent_id ? deps.planItems.get(item.parent_id) : null;
          const children = deps.planItems.getChildrenByParent(item.project_id, item.id).map((c) => ({
            id: c.id,
            title: c.title,
            status_category: c.status_category,
            external_key: c.external_key,
          }));

          const relations = deps.planRelations.getByItemIds([itemId]);
          const relatedIds = new Set<string>();
          for (const rel of relations) {
            relatedIds.add(rel.from_item_id);
            relatedIds.add(rel.to_item_id);
          }
          relatedIds.delete(itemId);
          const relatedItemMap = new Map(
            deps.planItems.getMany(Array.from(relatedIds)).map((i) => [i.id, i])
          );

          const blockedBy: { id: string; title: string; external_key: string | null }[] = [];
          const blocks: { id: string; title: string; external_key: string | null }[] = [];
          const relatedTo: { id: string; title: string; external_key: string | null }[] = [];
          for (const rel of relations) {
            const otherId = rel.from_item_id === itemId ? rel.to_item_id : rel.from_item_id;
            const other = relatedItemMap.get(otherId);
            const summary = {
              id: otherId,
              title: other?.title ?? '[deleted]',
              external_key: other?.external_key ?? null,
            };
            if (rel.relation_type === 'relates_to') relatedTo.push(summary);
            else if (
              (rel.relation_type === 'blocks' && rel.from_item_id === itemId) ||
              (rel.relation_type === 'depends_on' && rel.to_item_id === itemId)
            ) {
              blocks.push(summary);
            } else {
              blockedBy.push(summary);
            }
          }

          return jsonResult({
            item: {
              id: item.id,
              title: item.title,
              description: item.description,
              intent: item.intent,
              acceptance_criteria: item.acceptance_criteria,
              status: item.status,
              status_category: item.status_category,
              label: item.label,
              release_tag: item.release_tag,
              external_key: item.external_key,
            },
            parent: parent
              ? { id: parent.id, title: parent.title, external_key: parent.external_key }
              : null,
            children,
            dependencies: { blockedBy, blocks, relatedTo },
          });
        } catch (error) {
          return toolError(`get_plan_item failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),

    tool(
      'read_project_document',
      `Read a markdown or text document from the developer's KPM project folder (iteration docs, design notes, AGENTS.md, CLAUDE.md, etc.). Use when a reviewer's concern might be explained by a decision captured in a project doc. For files inside a connected code repo, don't use this — that content lives in the diff or the branch (use get_branch_activity). Content is truncated at ${MAX_DOCUMENT_CHARS} chars.`,
      {
        projectId: z.string().uuid().describe('The project UUID'),
        path: z.string().describe('Relative path under the project folder (e.g., "docs/foo.md")'),
      },
      async ({ projectId, path }) => {
        const result = await deps.fileExplorerService.readFileAsync(projectId, path);
        if (!result.ok) return toolError(result.error);
        const content = result.data;
        return jsonResult({
          path,
          truncated: content.length > MAX_DOCUMENT_CHARS,
          content: content.length > MAX_DOCUMENT_CHARS
            ? content.slice(0, MAX_DOCUMENT_CHARS) + '\n\n... (truncated)'
            : content,
        });
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } }
    ),
  ];
}

export function createReviewAssessmentMcpServer(deps: ReviewAssessmentToolsDeps) {
  return createSdkMcpServer({
    name: 'review',
    version: '1.0.0',
    tools: createReviewAssessmentTools(deps),
  });
}

export const REVIEW_ASSESSMENT_TOOL_NAMES = [
  'mcp__review__list_project_branches',
  'mcp__review__get_branch_activity',
  'mcp__review__list_plan_items',
  'mcp__review__get_plan_item',
  'mcp__review__read_project_document',
] as const;
