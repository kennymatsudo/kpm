/**
 * GitHub CLI Utilities
 *
 * Reusable GitHub operations via the `gh` CLI.
 * Uses execFile (no shell) to prevent command injection.
 * Mirrors the pattern in gitUtils.ts.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  GitHubAuthorType,
  PrConversationComment,
  PrReviewSnapshot,
  PrReviewSummary,
  PrReviewThread,
  PrReviewThreadComment,
  PrTopLevelReview,
} from '../../../shared/types';
import type { GhAuthState } from '../../../shared/ghAuth';
import { gitExec } from './gitUtils';

const execFileAsync = promisify(execFile);

// =============================================================================
// Types
// =============================================================================

export interface GhPrCreateResult {
  number: number;
  url: string;
}

export interface GhPrStatus {
  number: number;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  baseRefName: string | null;
  checksStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  additions: number;
  deletions: number;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  isDraft: boolean;
}

export interface GhPrDetails {
  number: number;
  url: string;
  title: string;
  state: GhPrStatus['state'];
  isDraft: boolean;
  author: string | null;
  baseRefName: string | null;
  headRefName: string | null;
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: { path: string; additions: number; deletions: number }[];
}

export interface GhReviewThreadState {
  id: string;
  isResolved: boolean;
  resolvedBy: string | null;
}

export interface GhPrCreateOptions {
  head: string;
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}

// =============================================================================
// Core Execution
// =============================================================================

/**
 * Execute a gh CLI command safely without shell interpolation.
 */
async function ghExec(
  args: string[],
  options: { cwd: string; maxBuffer?: number }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('gh', args, options);
}

async function ghExecWithInput(
  args: string[],
  input: string,
  options: { cwd: string; maxBuffer?: number }
): Promise<{ stdout: string; stderr: string }> {
  const execution = execFileAsync('gh', args, options);
  execution.child.stdin?.end(input);
  return execution;
}

export function buildGraphQLPayload(
  query: string,
  variables: Record<string, string | number | boolean | null | undefined>
): string {
  const definedVariables: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (value == null) continue;
    definedVariables[key] = value;
  }
  return JSON.stringify({ query, variables: definedVariables });
}

// Variables are sent as a JSON body over stdin rather than `-F key=value`
// because gh interprets a field value starting with `@` as a filename to read
// (and `-` as stdin). Review-thread replies are AI-drafted from untrusted PR
// text, so `-F` would let a crafted body exfiltrate a local file. Do not revert
// to `-F`.
async function ghGraphQL<T>(
  cwd: string,
  query: string,
  variables: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const { stdout } = await ghExecWithInput(
    ['api', 'graphql', '--input', '-'],
    buildGraphQLPayload(query, variables),
    { cwd, maxBuffer: 10 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout);
  return (parsed.data ?? parsed) as T;
}

// =============================================================================
// Auth
// =============================================================================

// gh prints the credential source in parentheses after the account name, e.g.
// "Logged in to github.com account octocat (keyring)" or "(GITHUB_TOKEN)".
const GH_LOGGED_IN = /Logged in to github\.com account (\S+)(?: \(([^)]+)\))?/;

/** gh's documented token variables, highest precedence first. */
const GH_TOKEN_ENV_VARS = ['GH_TOKEN', 'GITHUB_TOKEN'] as const;

// gh's own wording for a genuine logged-out answer, covering both the
// no-hosts-at-all form ("...any GitHub hosts") and the per-host form
// ("...any accounts on github.com").
const GH_NOT_LOGGED_IN = /you are not logged into/i;

export function parseGhAuthOutput(
  output: string,
  env: NodeJS.ProcessEnv = process.env
): GhAuthState | null {
  const match = GH_LOGGED_IN.exec(output);
  if (!match) return null;

  const source = match[2];
  const named = GH_TOKEN_ENV_VARS.find((name) => name === source);

  return {
    authenticated: true,
    account: match[1],
    // gh names the env var as the source when set; otherwise probe our own environment for builds that print a config path.
    tokenEnvVar: named ?? GH_TOKEN_ENV_VARS.find((name) => env[name]),
  };
}

/**
 * Only gh's explicit "you are not logged into…" answer means logged out.
 * Everything else it can print while failing — an invalid token, an unreachable
 * network — arrives as the same "Failed to log in to github.com" block, so those
 * are indistinguishable from each other and must not be reported as logged out;
 * `gh auth login` is not the remedy for a dropped connection.
 */
function interpretGhAuthOutput(
  output: string,
  env: NodeJS.ProcessEnv = process.env
): GhAuthState {
  const parsed = parseGhAuthOutput(output, env);
  if (parsed) return parsed;
  return GH_NOT_LOGGED_IN.test(output)
    ? { authenticated: false, reason: 'not_authenticated' }
    : { authenticated: false, reason: 'check_failed' };
}

function ghErrorOutput(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  const { stderr, stdout, message } = error as {
    stderr?: unknown;
    stdout?: unknown;
    message?: unknown;
  };
  return [stderr, stdout, message].filter((part) => typeof part === 'string').join('\n');
}

/** gh exits non-zero both when absent and when merely logged out, and still reports a usable account on stderr in some logged-in-but-degraded states. */
export function classifyGhAuthError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env
): GhAuthState {
  if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
    return { authenticated: false, reason: 'not_installed' };
  }

  return interpretGhAuthOutput(ghErrorOutput(error), env);
}

/** Distinguishes gh missing from gh not-logged-in since the remedies differ, and reports an env-supplied token so an expired one can be identified rather than guessed at. */
export async function checkGhAuth(cwd: string): Promise<GhAuthState> {
  try {
    const { stdout, stderr } = await ghExec(
      ['auth', 'status', '--hostname', 'github.com'],
      { cwd }
    );
    // gh auth status writes account info to stderr (not stdout)
    return interpretGhAuthOutput(stdout + stderr);
  } catch (error) {
    return classifyGhAuthError(error);
  }
}

// =============================================================================
// Repository Info
// =============================================================================

/**
 * Get the owner/repo slug for a repository (e.g., "octocat/hello-world").
 */
async function getRepoSlug(cwd: string): Promise<string> {
  const { stdout } = await ghExec(
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { cwd }
  );
  return stdout.trim();
}

function splitRepoSlug(slug: string): { owner: string; name: string } {
  const [owner, name] = slug.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid GitHub repository slug: ${slug}`);
  }
  return { owner, name };
}

// =============================================================================
// Pull Requests
// =============================================================================

export function buildCreatePrArgs(opts: GhPrCreateOptions): string[] {
  const args = [
    'pr', 'create',
    '--head', opts.head,
    '--base', opts.base,
    '--title', opts.title,
    '--body', opts.body,
  ];
  if (opts.draft) {
    args.push('--draft');
  }
  return args;
}

export function parseCreatePrOutput(stdout: string): GhPrCreateResult {
  const url = stdout
    .split(/\s+/)
    .map((token) => token.trim().replace(/[),.;]+$/g, ''))
    .find((token) => /^https?:\/\/\S+\/pull\/\d+\/?$/.test(token));

  if (!url) {
    const trimmed = stdout.trim();
    throw new Error(
      trimmed
        ? `Failed to parse created pull request URL from gh output: ${trimmed}`
        : 'Failed to parse created pull request URL from gh output: command returned no output'
    );
  }

  const match = /\/pull\/(\d+)\/?$/.exec(url);
  if (!match) {
    throw new Error(`Failed to parse pull request number from URL: ${url}`);
  }

  return {
    number: Number.parseInt(match[1], 10),
    url,
  };
}

/**
 * Create a pull request.
 */
export async function createPr(
  cwd: string,
  opts: GhPrCreateOptions
): Promise<GhPrCreateResult> {
  const args = buildCreatePrArgs(opts);
  const { stdout } = await ghExec(args, { cwd });
  return parseCreatePrOutput(stdout);
}

/**
 * Get PR status for a branch. Returns null if no PR exists.
 */
export async function getPrForBranch(
  cwd: string,
  branch: string
): Promise<GhPrStatus | null> {
  try {
    const { stdout } = await ghExec(
      [
        'pr', 'view', branch,
        '--json', 'number,url,state,reviewDecision,baseRefName,statusCheckRollup,additions,deletions,mergeable,isDraft',
      ],
      { cwd }
    );

    return parsePrViewOutput(stdout);
  } catch {
    // gh pr view exits non-zero when no PR exists for the branch
    return null;
  }
}

/**
 * Get PR status by PR number. Returns null if no PR exists.
 */
export async function getPrByNumber(
  cwd: string,
  prNumber: number
): Promise<GhPrStatus | null> {
  try {
    const { stdout } = await ghExec(
      [
        'pr', 'view', String(prNumber),
        '--json', 'number,url,state,reviewDecision,baseRefName,statusCheckRollup,additions,deletions,mergeable,isDraft',
      ],
      { cwd }
    );

    return parsePrViewOutput(stdout);
  } catch {
    return null;
  }
}

/**
 * Full PR contents for reading a pull request that is not the current branch's.
 *
 * Unlike `getPrByNumber`, this throws instead of returning null: the caller needs
 * to tell "no such PR" apart from "gh is not authenticated", and only the error
 * carries that.
 */
export async function getPrDetails(cwd: string, prRef: string): Promise<GhPrDetails> {
  const { stdout } = await ghExec(
    [
      'pr', 'view', prRef,
      '--json', 'number,url,title,state,isDraft,author,baseRefName,headRefName,body,additions,deletions,changedFiles,files',
    ],
    { cwd, maxBuffer: 10 * 1024 * 1024 }
  );
  return parsePrDetailsOutput(stdout);
}

/**
 * The PR's unified diff against its base, as GitHub computes it — no local
 * checkout of the head branch required.
 */
export async function getPrDiff(cwd: string, prRef: string): Promise<string> {
  const { stdout } = await ghExec(['pr', 'diff', prRef], { cwd, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

/**
 * Normalize a user-supplied PR reference into a single `gh` argument.
 *
 * A URL is passed through rather than reduced to its number, because gh resolves
 * it against the repo in the URL — that is what lets a PR in an unconnected repo
 * be read from a connected repo's directory. Anything that is not a bare number
 * or a github.com pull URL is rejected so a stray value can never arrive as a
 * `gh` flag.
 */
export function parsePrRef(input: string): string | null {
  const trimmed = input.trim();
  if (/^#?\d+$/.test(trimmed)) return trimmed.replace(/^#/, '');
  if (/^https:\/\/([\w-]+\.)*github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+(\/|$)/.test(trimmed)) return trimmed;
  return null;
}

function parsePrDetailsOutput(stdout: string): GhPrDetails {
  const raw = JSON.parse(stdout) as {
    number: number;
    url: string;
    title: string;
    state: string;
    isDraft: boolean;
    author?: { login?: string | null } | null;
    baseRefName?: string | null;
    headRefName?: string | null;
    body?: string | null;
    additions: number;
    deletions: number;
    changedFiles: number;
    files?: { path: string; additions: number; deletions: number }[] | null;
  };

  return {
    number: raw.number,
    url: raw.url,
    title: raw.title,
    state: raw.state as GhPrStatus['state'],
    isDraft: Boolean(raw.isDraft),
    author: raw.author?.login ?? null,
    baseRefName: raw.baseRefName ?? null,
    headRefName: raw.headRefName ?? null,
    body: raw.body ?? '',
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    files: raw.files ?? [],
  };
}

function truncatePreview(body: string, maxLength = 160): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function toAuthorType(rawType: string | null | undefined): GitHubAuthorType {
  switch (rawType) {
    case 'User':
    case 'Bot':
    case 'Organization':
    case 'App':
    case 'Mannequin':
      return rawType;
    case undefined:
    case null:
    default:
      return 'Unknown';
  }
}

function isHumanAuthorType(authorType: GitHubAuthorType): boolean {
  return authorType === 'User';
}

interface GhGraphQLPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GhGraphQLActor {
  login: string | null;
  __typename: string | null;
}

interface GhGraphQLReviewCommentNode {
  id: string;
  databaseId: number | null;
  url: string;
  body: string;
  createdAt: string;
  author: GhGraphQLActor | null;
  authorAssociation: string | null;
  replyTo: { id: string } | null;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
}

interface GhGraphQLReviewThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string | null;
  line: number | null;
  startLine: number | null;
  subjectType: string | null;
  diffSide: 'LEFT' | 'RIGHT' | null;
  resolvedBy: GhGraphQLActor | null;
  comments: {
    pageInfo: GhGraphQLPageInfo;
    nodes: (GhGraphQLReviewCommentNode | null)[];
  };
}

interface GhGraphQLTopLevelReviewNode {
  id: string;
  databaseId: number | null;
  url: string;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | null;
  submittedAt: string | null;
  author: GhGraphQLActor | null;
  authorAssociation: string | null;
  commit: { oid: string } | null;
}

interface GhGraphQLConversationCommentNode {
  id: string;
  databaseId: number | null;
  url: string;
  body: string;
  createdAt: string;
  author: GhGraphQLActor | null;
  authorAssociation: string | null;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
}

interface GhGraphQLReviewThreadsPageResponse {
  repository: {
    pullRequest: {
      reviewThreads: GhGraphQLReviewThreadsPage;
    } | null;
  } | null;
}

interface GhGraphQLReviewThreadsPage {
  pageInfo: GhGraphQLPageInfo;
  nodes: (GhGraphQLReviewThreadNode | null)[];
}

interface GhGraphQLTopLevelReviewsPageResponse {
  repository: {
    pullRequest: {
      reviews: GhGraphQLTopLevelReviewsPage;
    } | null;
  } | null;
}

interface GhGraphQLTopLevelReviewsPage {
  pageInfo: GhGraphQLPageInfo;
  nodes: (GhGraphQLTopLevelReviewNode | null)[];
}

interface GhGraphQLConversationCommentsPageResponse {
  repository: {
    pullRequest: {
      comments: GhGraphQLConversationCommentsPage;
    } | null;
  } | null;
}

interface GhGraphQLConversationCommentsPage {
  pageInfo: GhGraphQLPageInfo;
  nodes: (GhGraphQLConversationCommentNode | null)[];
}

function mapReviewThreadComment(node: GhGraphQLReviewCommentNode): PrReviewThreadComment {
  return {
    id: node.id,
    databaseId: node.databaseId,
    url: node.url,
    author: node.author?.login ?? 'unknown',
    authorType: toAuthorType(node.author?.__typename),
    authorAssociation: node.authorAssociation,
    body: node.body,
    createdAt: node.createdAt,
    replyToId: node.replyTo?.id ?? null,
    viewerCanUpdate: node.viewerCanUpdate,
    viewerCanDelete: node.viewerCanDelete,
  };
}

function mapTopLevelReview(node: GhGraphQLTopLevelReviewNode): PrTopLevelReview {
  return {
    id: node.id,
    databaseId: node.databaseId,
    url: node.url,
    author: node.author?.login ?? 'unknown',
    authorType: toAuthorType(node.author?.__typename),
    authorAssociation: node.authorAssociation,
    body: node.body,
    state: node.state,
    submittedAt: node.submittedAt,
    commitOid: node.commit?.oid ?? null,
  };
}

function mapConversationComment(node: GhGraphQLConversationCommentNode): PrConversationComment {
  return {
    id: node.id,
    databaseId: node.databaseId,
    url: node.url,
    author: node.author?.login ?? 'unknown',
    authorType: toAuthorType(node.author?.__typename),
    authorAssociation: node.authorAssociation,
    body: node.body,
    createdAt: node.createdAt,
    viewerCanUpdate: node.viewerCanUpdate,
    viewerCanDelete: node.viewerCanDelete,
  };
}

async function fetchAdditionalReviewThreadComments(
  cwd: string,
  threadId: string,
  after: string | null
): Promise<PrReviewThreadComment[]> {
  const comments: PrReviewThreadComment[] = [];
  let cursor = after;

  while (cursor) {
    const response = await ghGraphQL<{
      node: {
        comments: {
          pageInfo: GhGraphQLPageInfo;
          nodes: (GhGraphQLReviewCommentNode | null)[];
        };
      } | null;
    }>(
      cwd,
      `query($threadId: ID!, $after: String) {
        node(id: $threadId) {
          ... on PullRequestReviewThread {
            comments(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                databaseId
                url
                body
                createdAt
                author { login __typename }
                authorAssociation
                replyTo { id }
                viewerCanUpdate
                viewerCanDelete
              }
            }
          }
        }
      }`,
      { threadId, after: cursor }
    );

    const page = response.node?.comments;
    if (!page) break;

    comments.push(
      ...page.nodes.filter((node): node is GhGraphQLReviewCommentNode => node != null).map(mapReviewThreadComment)
    );

    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  }

  return comments;
}

function buildReviewThread(node: GhGraphQLReviewThreadNode, prUrl: string): PrReviewThread {
  const comments = node.comments.nodes
    .filter((comment): comment is GhGraphQLReviewCommentNode => comment != null)
    .map(mapReviewThreadComment);
  const participants = Array.from(
    new Set(
      comments
        .map((comment) => comment.author)
        .filter((author): author is string => Boolean(author))
    )
  );
  const hasHumanReviewerComment = comments.some((comment) => isHumanAuthorType(comment.authorType));
  const hasBotOnlyComments = comments.length > 0 && comments.every((comment) => !isHumanAuthorType(comment.authorType));
  const latestComment = comments[comments.length - 1];

  return {
    id: node.id,
    url: latestComment?.url ?? prUrl,
    path: node.path,
    line: node.line,
    startLine: node.startLine,
    subjectType: node.subjectType,
    diffSide: node.diffSide,
    isResolved: node.isResolved,
    isOutdated: node.isOutdated,
    resolvedBy: node.resolvedBy?.login ?? null,
    updatedAt: latestComment?.createdAt ?? '',
    participants,
    comments,
    hasBotOnlyComments,
    hasHumanReviewerComment,
    latestCommentPreview: latestComment ? truncatePreview(latestComment.body) : null,
  };
}

function buildReviewSummary(
  threads: PrReviewThread[],
  topLevelReviews: PrTopLevelReview[],
  conversationComments: PrConversationComment[]
): PrReviewSummary {
  return {
    totalThreads: threads.length,
    unresolvedThreads: threads.filter((thread) => !thread.isResolved).length,
    resolvedThreads: threads.filter((thread) => thread.isResolved).length,
    outdatedThreads: threads.filter((thread) => thread.isOutdated).length,
    actionableThreads: threads.filter((thread) => !thread.isResolved && !thread.isOutdated).length,
    humanThreads: threads.filter((thread) => thread.hasHumanReviewerComment).length,
    botOnlyThreads: threads.filter((thread) => thread.hasBotOnlyComments).length,
    topLevelReviewCount: topLevelReviews.length,
    conversationCommentCount: conversationComments.length,
  };
}

async function fetchReviewThreads(
  cwd: string,
  owner: string,
  name: string,
  prNumber: number,
  prUrl: string
): Promise<PrReviewThread[]> {
  const threads: PrReviewThread[] = [];
  let cursor: string | null = null;

  do {
    const response: GhGraphQLReviewThreadsPageResponse = await ghGraphQL<GhGraphQLReviewThreadsPageResponse>(
      cwd,
      `query($owner: String!, $name: String!, $prNumber: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $prNumber) {
            reviewThreads(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                isResolved
                isOutdated
                path
                line
                startLine
                subjectType
                diffSide
                resolvedBy { login __typename }
                comments(first: 100) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    id
                    databaseId
                    url
                    body
                    createdAt
                    author { login __typename }
                    authorAssociation
                    replyTo { id }
                    viewerCanUpdate
                    viewerCanDelete
                  }
                }
              }
            }
          }
        }
      }`,
      { owner, name, prNumber, after: cursor }
    );

    const page: GhGraphQLReviewThreadsPage | undefined = response.repository?.pullRequest?.reviewThreads;
    if (!page) break;

    const pageThreads = await Promise.all(
      page.nodes
        .filter((node): node is GhGraphQLReviewThreadNode => node != null)
        .map(async (node) => {
          const thread = buildReviewThread(node, prUrl);
          if (node.comments.pageInfo.hasNextPage && node.comments.pageInfo.endCursor) {
            thread.comments.push(
              ...await fetchAdditionalReviewThreadComments(cwd, node.id, node.comments.pageInfo.endCursor)
            );
            const latestComment = thread.comments[thread.comments.length - 1];
            thread.participants = Array.from(new Set(thread.comments.map((comment) => comment.author)));
            thread.hasHumanReviewerComment = thread.comments.some((comment) => isHumanAuthorType(comment.authorType));
            thread.hasBotOnlyComments =
              thread.comments.length > 0 && thread.comments.every((comment) => !isHumanAuthorType(comment.authorType));
            thread.latestCommentPreview = latestComment ? truncatePreview(latestComment.body) : null;
            thread.url = latestComment?.url ?? thread.url;
          }
          return thread;
        })
    );

    threads.push(...pageThreads);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return threads;
}

async function fetchTopLevelReviews(
  cwd: string,
  owner: string,
  name: string,
  prNumber: number
): Promise<PrTopLevelReview[]> {
  const reviews: PrTopLevelReview[] = [];
  let cursor: string | null = null;

  do {
    const response: GhGraphQLTopLevelReviewsPageResponse = await ghGraphQL<GhGraphQLTopLevelReviewsPageResponse>(
      cwd,
      `query($owner: String!, $name: String!, $prNumber: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $prNumber) {
            reviews(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                databaseId
                url
                body
                state
                submittedAt
                author { login __typename }
                authorAssociation
                commit { oid }
              }
            }
          }
        }
      }`,
      { owner, name, prNumber, after: cursor }
    );

    const page: GhGraphQLTopLevelReviewsPage | undefined = response.repository?.pullRequest?.reviews;
    if (!page) break;

    reviews.push(
      ...page.nodes.filter((node): node is GhGraphQLTopLevelReviewNode => node != null).map(mapTopLevelReview)
    );

    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return reviews;
}

async function fetchConversationComments(
  cwd: string,
  owner: string,
  name: string,
  prNumber: number
): Promise<PrConversationComment[]> {
  const comments: PrConversationComment[] = [];
  let cursor: string | null = null;

  do {
    const response: GhGraphQLConversationCommentsPageResponse = await ghGraphQL<GhGraphQLConversationCommentsPageResponse>(
      cwd,
      `query($owner: String!, $name: String!, $prNumber: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $prNumber) {
            comments(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                databaseId
                url
                body
                createdAt
                author { login __typename }
                authorAssociation
                viewerCanUpdate
                viewerCanDelete
              }
            }
          }
        }
      }`,
      { owner, name, prNumber, after: cursor }
    );

    const page: GhGraphQLConversationCommentsPage | undefined = response.repository?.pullRequest?.comments;
    if (!page) break;

    comments.push(
      ...page.nodes
        .filter((node): node is GhGraphQLConversationCommentNode => node != null)
        .map(mapConversationComment)
    );

    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return comments;
}

export interface PrReviewProbe {
  prNumber: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: PrReviewSnapshot['reviewDecision'];
  headOid: string;
  updatedAt: string;
  isDraft: boolean;
  threadCount: number;
  reviewCount: number;
  conversationCommentCount: number;
  digest: string;
}

/**
 * Cheap probe used to decide whether the heavy thread-walk is necessary.
 *
 * One small GraphQL query — totals only, no node bodies — gives us enough
 * signal to detect any change worth processing (new comment, new review,
 * resolution toggle, head push, decision change). When the resulting digest
 * matches the one persisted from the previous successful sync, the caller
 * can skip the full snapshot.
 */
export async function probePrReviewState(
  cwd: string,
  prNumber: number
): Promise<PrReviewProbe> {
  const slug = await getRepoSlug(cwd);
  const { owner, name } = splitRepoSlug(slug);

  const response = await ghGraphQL<{
    repository: {
      pullRequest: {
        number: number;
        state: 'OPEN' | 'CLOSED' | 'MERGED';
        reviewDecision: PrReviewSnapshot['reviewDecision'];
        headRefOid: string;
        updatedAt: string;
        isDraft: boolean;
        reviewThreads: { totalCount: number };
        reviews: { totalCount: number };
        comments: { totalCount: number };
      } | null;
    } | null;
  }>(
    cwd,
    `query($owner: String!, $name: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $prNumber) {
          number
          state
          reviewDecision
          headRefOid
          updatedAt
          isDraft
          reviewThreads(first: 0) { totalCount }
          reviews(first: 0) { totalCount }
          comments(first: 0) { totalCount }
        }
      }
    }`,
    { owner, name, prNumber }
  );

  const pullRequest = response.repository?.pullRequest;
  if (!pullRequest) {
    throw new Error(`PR #${prNumber} not found in ${slug}`);
  }

  const threadCount = pullRequest.reviewThreads.totalCount;
  const reviewCount = pullRequest.reviews.totalCount;
  const conversationCommentCount = pullRequest.comments.totalCount;
  const reviewDecision = pullRequest.reviewDecision ?? null;
  const digest = [
    pullRequest.state,
    reviewDecision ?? 'NONE',
    pullRequest.headRefOid,
    pullRequest.updatedAt,
    pullRequest.isDraft,
    threadCount,
    reviewCount,
    conversationCommentCount,
  ].join('|');

  return {
    prNumber: pullRequest.number,
    state: pullRequest.state,
    reviewDecision,
    headOid: pullRequest.headRefOid,
    updatedAt: pullRequest.updatedAt,
    isDraft: pullRequest.isDraft,
    threadCount,
    reviewCount,
    conversationCommentCount,
    digest,
  };
}

export async function getPrReviewSnapshot(
  cwd: string,
  prNumber: number
): Promise<PrReviewSnapshot> {
  const slug = await getRepoSlug(cwd);
  const { owner, name } = splitRepoSlug(slug);

  const response = await ghGraphQL<{
    repository: {
      pullRequest: {
        number: number;
        url: string;
        title: string;
        state: 'OPEN' | 'CLOSED' | 'MERGED';
        reviewDecision: PrReviewSnapshot['reviewDecision'];
        headRefOid: string;
        baseRefName: string;
        headRefName: string;
        updatedAt: string;
        isDraft: boolean;
      } | null;
    } | null;
  }>(
    cwd,
    `query($owner: String!, $name: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $prNumber) {
          number
          url
          title
          state
          reviewDecision
          headRefOid
          baseRefName
          headRefName
          updatedAt
          isDraft
        }
      }
    }`,
    { owner, name, prNumber }
  );

  const pullRequest = response.repository?.pullRequest;
  if (!pullRequest) {
    throw new Error(`PR #${prNumber} not found in ${slug}`);
  }

  const [threads, topLevelReviews, conversationComments] = await Promise.all([
    fetchReviewThreads(cwd, owner, name, prNumber, pullRequest.url),
    fetchTopLevelReviews(cwd, owner, name, prNumber),
    fetchConversationComments(cwd, owner, name, prNumber),
  ]);

  return {
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
    title: pullRequest.title,
    state: pullRequest.state,
    reviewDecision: pullRequest.reviewDecision ?? null,
    headOid: pullRequest.headRefOid,
    baseRefName: pullRequest.baseRefName,
    headRefName: pullRequest.headRefName,
    updatedAt: pullRequest.updatedAt,
    isDraft: pullRequest.isDraft,
    fetchedAt: new Date().toISOString(),
    summary: buildReviewSummary(threads, topLevelReviews, conversationComments),
    threads,
    topLevelReviews,
    conversationComments,
  };
}

export async function replyToReviewThread(
  cwd: string,
  threadId: string,
  body: string
): Promise<PrReviewThreadComment> {
  const response = await ghGraphQL<{
    addPullRequestReviewThreadReply: {
      comment: GhGraphQLReviewCommentNode | null;
    } | null;
  }>(
    cwd,
    `mutation($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: {
        pullRequestReviewThreadId: $threadId,
        body: $body
      }) {
        comment {
          id
          databaseId
          url
          body
          createdAt
          author { login __typename }
          authorAssociation
          replyTo { id }
          viewerCanUpdate
          viewerCanDelete
        }
      }
    }`,
    { threadId, body }
  );

  const comment = response.addPullRequestReviewThreadReply?.comment;
  if (!comment) {
    throw new Error('GitHub did not return a thread reply comment');
  }

  return mapReviewThreadComment(comment);
}

export async function resolveReviewThread(
  cwd: string,
  threadId: string
): Promise<GhReviewThreadState> {
  const response = await ghGraphQL<{
    resolveReviewThread: {
      thread: {
        id: string;
        isResolved: boolean;
        resolvedBy: GhGraphQLActor | null;
      } | null;
    } | null;
  }>(
    cwd,
    `mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread {
          id
          isResolved
          resolvedBy { login __typename }
        }
      }
    }`,
    { threadId }
  );

  const thread = response.resolveReviewThread?.thread;
  if (!thread) {
    throw new Error('GitHub did not return a resolved review thread');
  }

  return {
    id: thread.id,
    isResolved: thread.isResolved,
    resolvedBy: thread.resolvedBy?.login ?? null,
  };
}

export async function unresolveReviewThread(
  cwd: string,
  threadId: string
): Promise<GhReviewThreadState> {
  const response = await ghGraphQL<{
    unresolveReviewThread: {
      thread: {
        id: string;
        isResolved: boolean;
        resolvedBy: GhGraphQLActor | null;
      } | null;
    } | null;
  }>(
    cwd,
    `mutation($threadId: ID!) {
      unresolveReviewThread(input: { threadId: $threadId }) {
        thread {
          id
          isResolved
          resolvedBy { login __typename }
        }
      }
    }`,
    { threadId }
  );

  const thread = response.unresolveReviewThread?.thread;
  if (!thread) {
    throw new Error('GitHub did not return an unresolved review thread');
  }

  return {
    id: thread.id,
    isResolved: thread.isResolved,
    resolvedBy: thread.resolvedBy?.login ?? null,
  };
}

/**
 * Parse a PR identifier string into a PR number.
 * Accepts: bare number, #number, or GitHub PR URL.
 */
export function parsePrIdentifier(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^#\d+$/.test(trimmed)) return parseInt(trimmed.slice(1), 10);
  const urlMatch = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/.exec(trimmed);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  return null;
}

/**
 * Parse `gh pr view --json` output into a GhPrStatus object.
 */
function parsePrViewOutput(stdout: string): GhPrStatus {
  const raw = JSON.parse(stdout) as {
    number: number;
    url: string;
    state: string;
    reviewDecision: string;
    baseRefName?: string | null;
    statusCheckRollup: { state: string }[] | null;
    additions: number;
    deletions: number;
    mergeable: string;
    isDraft: boolean;
  };

  let checksStatus: GhPrStatus['checksStatus'] = null;
  if (raw.statusCheckRollup && raw.statusCheckRollup.length > 0) {
    const states = raw.statusCheckRollup.map(c => c.state);
    if (states.every(s => s === 'SUCCESS')) {
      checksStatus = 'SUCCESS';
    } else if (states.some(s => s === 'FAILURE' || s === 'ERROR')) {
      checksStatus = 'FAILURE';
    } else {
      checksStatus = 'PENDING';
    }
  }

  return {
    number: raw.number,
    url: raw.url,
    state: raw.state as GhPrStatus['state'],
    reviewDecision: (raw.reviewDecision || null) as GhPrStatus['reviewDecision'],
    baseRefName: raw.baseRefName ?? null,
    checksStatus,
    additions: raw.additions,
    deletions: raw.deletions,
    mergeable: (raw.mergeable || 'UNKNOWN') as GhPrStatus['mergeable'],
    isDraft: Boolean(raw.isDraft),
  };
}

// =============================================================================
// Git Operations
// =============================================================================

/**
 * Whether a branch has been pushed to the remote.
 *
 * Reads the local remote-tracking ref, which only moves on fetch or push — a
 * branch deleted on the remote still reads as pushed until the next fetch. Use
 * `hasUpstream` (branchFacts) for the different question of whether a push needs
 * `--set-upstream`.
 */
export async function isBranchPushed(cwd: string, branch: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', `origin/${branch}`], { cwd });
    return true;
  } catch {
    return false;
  }
}
