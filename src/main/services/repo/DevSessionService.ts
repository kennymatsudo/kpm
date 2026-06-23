/**
 * DevSessionService - Manages development sessions for plan item implementation
 *
 * Each session:
 * - Creates an isolated git worktree from master/main
 * - Starts an implementation agent through AgentSessionManager
 * - Tracks status (pending → active → inactive)
 * - Persists across app restarts
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import {
  isCommitHookRepairPhase,
  type DevSession,
  type DevSessionAutomationPhase,
  type DevSessionStatus,
  type DevSessionWithPlanItem,
  type PlanItem,
  type Project,
  type AgentType,
  type AgentEffortLevel,
  type AgentExecutionMode,
  type AgentReviewPolicy,
  type RepoEnvironmentMode,
} from '../../../shared/types';
import { captureRepoEnvironment } from './EnvironmentService';
import type {
  IAppSettingsRepository,
  IAgentReviewRepository,
  IDevSessionRepository,
  IPlanItemRepository,
  IPlanRelationRepository,
  IProjectRepository,
  IRepoRepository,
} from '../../db/interfaces';
import { computeMergeOrder, type MergeOrderEntry } from './mergeOrder';
import type { Options as SDKOptions, Settings as SDKSettings } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { formatPlanRefSection } from '../../claude/contextRefs';
import { getConfig } from '../../config';
import {
  createStatusBroadcaster,
} from './sessionOrchestration';
import { gitExec, getCurrentBranch, resolveUpstreamBranch, getMergeBase, resolveBaseSha } from './gitUtils';
import { openDirectoryInCodeEditor } from './editorLauncher';
import type { AgentSessionManager } from '../agents/AgentSessionManager';

interface AgentContextInput {
  item: PlanItem;
  project: Project;
  children: PlanItem[];
  parent: PlanItem | null;
}

type KnownDescriptionSection = 'acceptanceCriteria' | 'outOfScope' | 'dependencies' | 'codeReferences' | 'verification';

interface ParsedDescription {
  context: string | null;
  knownSections: Partial<Record<KnownDescriptionSection, string>>;
}

const DESCRIPTION_SECTION_MAP: Record<string, KnownDescriptionSection> = {
  'acceptance criteria': 'acceptanceCriteria',
  'out of scope': 'outOfScope',
  dependencies: 'dependencies',
  'code references': 'codeReferences',
  verification: 'verification',
};

function normalizeDescriptionHeading(heading: string): string {
  return heading.trim().replace(/#+$/, '').trim().toLowerCase();
}

function appendDescriptionBlock(current: string | undefined, block: string): string {
  return current ? `${current}\n\n${block}` : block;
}

function parseDescriptionSections(description: string | null): ParsedDescription {
  if (!description?.trim()) {
    return { context: null, knownSections: {} };
  }

  const knownSections: ParsedDescription['knownSections'] = {};
  const contextBlocks: string[] = [];
  const lines = description.trim().split(/\r?\n/);
  let currentKnown: KnownDescriptionSection | null = null;
  let currentContextHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const block = buffer.join('\n').trim();
    buffer = [];
    if (!block) {
      currentKnown = null;
      currentContextHeading = null;
      return;
    }

    if (currentKnown) {
      knownSections[currentKnown] = appendDescriptionBlock(knownSections[currentKnown], block);
    } else if (currentContextHeading) {
      contextBlocks.push(`${currentContextHeading}\n${block}`);
    } else {
      contextBlocks.push(block);
    }

    currentKnown = null;
    currentContextHeading = null;
  };

  for (const line of lines) {
    const headingMatch = /^##\s+(.+)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      const normalized = normalizeDescriptionHeading(headingMatch[1]);
      const known = DESCRIPTION_SECTION_MAP[normalized];
      if (known) {
        currentKnown = known;
        currentContextHeading = null;
      } else {
        currentKnown = null;
        currentContextHeading = line.trim();
      }
      continue;
    }

    buffer.push(line);
  }

  flush();

  return {
    context: contextBlocks.length > 0 ? contextBlocks.join('\n\n') : null,
    knownSections,
  };
}

function splitMarkdownListItems(section: string | undefined): string[] {
  if (!section) return [];
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+(?:\[[ xX]\]\s*)?/, '').trim())
    .filter(Boolean);
}

function commandOutputToString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
  return '';
}

function formatGitExecError(error: unknown): string {
  const commandError = error as { stdout?: unknown; stderr?: unknown };
  const output = [
    commandOutputToString(commandError.stderr),
    commandOutputToString(commandError.stdout),
  ].filter(Boolean).join('\n').trim();

  if (output) return output;
  return error instanceof Error ? error.message : String(error);
}

type BoardClaudeModel = 'opus' | 'sonnet' | 'haiku';

const WORKFLOW_EXECUTION_INSTRUCTIONS = `## KPM Structured Workflow Mode

You are running in KPM workflow mode. Use Claude Code's Workflow tool before making repository edits when it is available. Create an in-memory workflow script; do not write .claude/workflows, .kpm, or other orchestration files into the repository.

The workflow should use these phases:
1. Inspect: read the task, repo instructions, likely touched files, current tests, and verification commands.
2. Discover: use read-only subagents for independent codebase questions. Use web search only when current external APIs, releases, security guidance, or software-development best practices materially affect the implementation.
3. Plan: choose a small implementation path, identify file ownership, and avoid parallel writers unless files are clearly partitioned.
4. Implement: make the code changes in this worktree only.
5. Verify: run targeted tests/checks and inspect the diff. Treat verification as a gate; if a command cannot run, record the exact reason.
6. Self-review: use a fresh-context review pass for correctness, requirements, security/data-loss risk, migrations, tests, and scope. Do not report style nits.
7. Finalize: produce the normal concise final summary with files changed, verification commands, and residual risks.

KPM will run the external opposing-agent review gate after your implementation completes when the session policy allows it. Do not ask the user for input. If the Workflow tool is unavailable, follow the same phases manually and say so in the final summary.`;

function resolveBoardModel(executionMode: AgentExecutionMode, agentType: AgentType): BoardClaudeModel {
  return executionMode === 'workflow' && agentType === 'claude' ? 'opus' : 'sonnet';
}

function resolveBoardEffort(
  model: BoardClaudeModel,
  requestedEffort: AgentEffortLevel | undefined,
  executionMode: AgentExecutionMode,
): AgentEffortLevel | undefined {
  const effort = requestedEffort ?? (executionMode === 'workflow' ? 'xhigh' : undefined);
  if (model !== 'opus' && (effort === 'xhigh' || effort === 'max')) {
    return 'high';
  }
  return effort;
}

function buildBoardSdkSettings(executionMode: AgentExecutionMode, effectiveEffort: AgentEffortLevel | undefined): SDKSettings {
  if (executionMode !== 'workflow') {
    return {
      disableWorkflows: true,
      workflowKeywordTriggerEnabled: false,
    };
  }

  return {
    enableWorkflows: true,
    workflowKeywordTriggerEnabled: true,
    ...(effectiveEffort === 'xhigh' && { ultracode: true }),
  };
}

function buildExecutionPrompt(basePrompt: string, executionMode: AgentExecutionMode): string {
  if (executionMode !== 'workflow') {
    return basePrompt;
  }
  return `${WORKFLOW_EXECUTION_INSTRUCTIONS}\n\n${basePrompt}`;
}

/**
 * Build agent context from plan item data
 * Note: Claude Code automatically reads CLAUDE.md/AGENTS.md from the worktree, so we don't include it here
 *
 * Exported for unit testing.
 */
export function buildAgentContext(input: AgentContextInput): string {
  const { item, children, parent } = input;
  const sections: string[] = [];
  const parsedDescription = parseDescriptionSections(item.description);
  const parsedCriteria = splitMarkdownListItems(parsedDescription.knownSections.acceptanceCriteria);
  const acceptanceCriteria = item.acceptance_criteria && item.acceptance_criteria.length > 0
    ? item.acceptance_criteria
    : parsedCriteria;
  const hasCriteria = acceptanceCriteria.length > 0;

  // Task title
  sections.push(`# Task: ${item.title}`);

  // Tracker reference (just the key for commit messages)
  if (item.external_key) {
    sections.push(`**Ticket:** ${item.external_key}`);
  }

  // Intent — one-sentence commitment. What "done" means at a glance.
  if (item.intent) {
    sections.push('## Intent');
    sections.push(item.intent);
  }

  // Acceptance criteria — the contract the agent must satisfy.
  if (hasCriteria) {
    sections.push('## Acceptance Criteria');
    sections.push(acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n'));
  }

  // Promote execution-critical sections from the prose description so agents treat
  // them as constraints/verification, not undifferentiated background context.
  if (parsedDescription.knownSections.outOfScope) {
    sections.push('## Out of Scope');
    sections.push(parsedDescription.knownSections.outOfScope);
  }

  if (parsedDescription.knownSections.dependencies) {
    sections.push('## Dependencies');
    sections.push(parsedDescription.knownSections.dependencies);
  }

  // Description — rationale and context. Demoted to "Context" when structured fields carry the contract.
  if (parsedDescription.context) {
    sections.push(hasCriteria ? '## Context' : '## Description');
    sections.push(parsedDescription.context);
  } else if (!item.intent && !hasCriteria) {
    sections.push('## Description');
    sections.push('No description provided.');
  }

  // Sub-tasks
  if (children.length > 0) {
    sections.push('## Sub-tasks');
    sections.push(children.map((c) => `- [ ] ${c.title}`).join('\n'));
  }

  // Parent context (only title, not full description - task should be self-contained)
  if (parent) {
    sections.push('## Parent Context');
    sections.push(`This is part of: **${parent.title}**`);
  }

  // Code refs
  const relevantFiles = [
    ...(item.code_refs ?? []),
    ...splitMarkdownListItems(parsedDescription.knownSections.codeReferences),
  ];
  if (relevantFiles.length > 0) {
    sections.push('## Relevant Files');
    sections.push(Array.from(new Set(relevantFiles)).map((r) => `- ${r}`).join('\n'));
  }

  if (parsedDescription.knownSections.verification) {
    sections.push('## Verification');
    sections.push(parsedDescription.knownSections.verification);
  }

  // Instructions
  sections.push('---');
  sections.push('## Instructions');
  sections.push('Task input priority: Acceptance Criteria are the completion contract; Intent explains why the task exists; Out of Scope is a hard boundary; Context/Description is background, not extra scope; Additional User Instructions may constrain implementation but should not expand scope unless explicit.');
  sections.push('Execution order: inspect repo instructions and nearby code before editing; identify the smallest existing codepath to modify; implement the narrowest change that satisfies the task; run the most relevant verification available; stop after the task is satisfied and do not opportunistically refactor.');
  if (parsedDescription.knownSections.verification) {
    sections.push('Run the Verification command(s) above before finishing unless impossible. If you cannot run them, state why.');
  }
  sections.push(hasCriteria
    ? 'Implement this task so that every acceptance criterion above is satisfied. In your final response, include a criterion-by-criterion status, exact verification performed, and any assumptions or follow-ups. Do not commit - I will review and commit the changes myself.'
    : 'Implement this task. In your final response, include what changed, exact verification performed, and any assumptions or follow-ups. Do not commit - I will review and commit the changes myself.');
  if (item.external_key) {
    sections.push(`Ticket reference for commits: **${item.external_key}**`);
  }

  return sections.join('\n\n');
}

function buildLegacyBoardPrompt(item: Pick<PlanItem, 'title' | 'description'>): string {
  const parts: string[] = [item.title];
  if (item.description) {
    parts.push('', item.description);
  }
  return parts.join('\n').trim();
}

/**
 * Build the board-start prompt around the canonical structured task context.
 * If the user leaves the board editor at its legacy default (title/description),
 * omit that duplicate text and rely on the structured context alone.
 */
export function buildBoardStartInstructions(
  input: AgentContextInput & { userPrompt?: string | null }
): string {
  const structuredContext = buildAgentContext(input);
  const normalizedUserPrompt = input.userPrompt?.trim() ?? '';
  const legacyDefaultPrompt = buildLegacyBoardPrompt(input.item);

  if (
    normalizedUserPrompt.length === 0
    || normalizedUserPrompt === input.item.title.trim()
    || normalizedUserPrompt === legacyDefaultPrompt
  ) {
    return structuredContext;
  }

  return [
    structuredContext,
    '## Additional User Instructions',
    normalizedUserPrompt,
  ].join('\n\n');
}

function commitHookRepairPhaseFor(
  phase: DevSessionAutomationPhase | null,
): DevSessionAutomationPhase {
  return phase === 'addressing_review' || phase === 'fixing_commit_hooks_after_review'
    ? 'fixing_commit_hooks_after_review'
    : 'fixing_commit_hooks';
}

export function automationPhaseAfterManualCommitResolution(
  phase: DevSessionAutomationPhase | null,
): DevSessionAutomationPhase | null {
  switch (phase) {
    case 'fixing_commit_hooks_after_review':
    case 'addressing_review':
      return 'ready_for_review';
    case 'fixing_commit_hooks':
    case 'needs_attention':
      return 'idle';
    case 'idle':
    case 'reviewing':
    case 'ready_for_review':
    case null:
      return phase;
  }
}

function buildCommitHookRepairPrompt(hookOutput: string): string {
  return [
    'The git commit failed while running commit hooks.',
    '',
    'Fix only the issues shown in the hook output below. Do not commit.',
    'Do not broaden the task or refactor unrelated code.',
    'After making the fix, rerun the narrowest relevant check if one is clear from the output.',
    '',
    'In your final response, include:',
    '1. What changed',
    '2. The exact verification command you ran, or "not run" with the reason',
    '',
    'Commit hook output:',
    '```text',
    hookOutput.trim() || 'No hook output was captured.',
    '```',
  ].join('\n');
}

export interface DevSessionServiceDeps {
  devSessions: IDevSessionRepository;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  projects: IProjectRepository;
  repos: IRepoRepository;
  appSettings: IAppSettingsRepository;
  agentReviews: IAgentReviewRepository;
  userDataPath: string;
  /** Resolves configurable prompt content (override > registry default). */
  getPromptContent: (key: string) => string;
  /** Wraps attached context files for prepending to agent prompts. */
  buildContextPrefix: (projectId: string, contextPaths: string[]) => AsyncResult<string>;
  /** Optional — when provided, dev sessions use the Agent SDK instead of PTY */
  agentSessionManager?: AgentSessionManager;
}
const broadcastSessionStatusChange = createStatusBroadcaster<DevSession>('dev-session:status-changed');

/**
 * Generate branch name from plan item using template
 *
 * Template variables:
 * - {date}   - YYYYMM (e.g., 202601)
 * - {ticket} - External key (e.g., PROJ-123)
 * - {name}   - Plan item title slug
 * - {id}     - Plan item ID prefix (6 chars)
 *
 * Smart default when template is empty:
 * - If ticket exists: {ticket}-{name}
 * - Otherwise: {id}-{name}
 */
function generateBranchName(item: PlanItem, template: string | undefined): string {
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // If no template, use smart default
  if (!template || template.trim() === '') {
    if (item.external_key) {
      return `${item.external_key}-${slug}`;
    }
    return `${item.id.substring(0, 6)}-${slug}`;
  }

  // Build date string (YYYYMM)
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Apply template substitutions
  let branchName = template
    .replace(/{date}/g, dateStr)
    .replace(/{ticket}/g, item.external_key || '')
    .replace(/{name}/g, slug)
    .replace(/{id}/g, item.id.substring(0, 6));

  // Clean up double separators and trailing/leading separators
  branchName = branchName
    .replace(/[_\-/]{2,}/g, (match) => match[0])  // Collapse multiple separators
    .replace(/^[_\-/]+/, '')  // Remove leading separators
    .replace(/[_\-/]+$/, ''); // Remove trailing separators

  return branchName;
}

/**
 * Get the worktrees directory for a repo
 */
function getWorktreesDir(repoPath: string): string {
  const repoName = path.basename(repoPath);
  return path.join(path.dirname(repoPath), `.kpm-worktrees`, repoName);
}

/**
 * Check if a branch exists in the repo
 */
async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', `refs/heads/${branchName}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique branch name by appending -v2, -v3, etc. if needed
 */
async function generateUniqueBranchName(repoPath: string, baseBranchName: string): Promise<string> {
  // First check if base name is available
  if (!(await branchExists(repoPath, baseBranchName))) {
    return baseBranchName;
  }

  // Find next available version
  let version = 2;
  while (version < 100) {
    const versionedName = `${baseBranchName}-v${version}`;
    if (!(await branchExists(repoPath, versionedName))) {
      return versionedName;
    }
    version++;
  }

  // Fallback to timestamp if somehow we have 100 versions
  return `${baseBranchName}-${Date.now()}`;
}

/**
 * Detect the default branch (main or master)
 */
async function detectDefaultBranch(repoPath: string): Promise<string> {
  try {
    // Try to get the remote HEAD reference using safe array arguments
    const { stdout } = await gitExec(
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { cwd: repoPath }
    );
    const ref = stdout.trim();
    return ref.replace('refs/remotes/origin/', '').replace('refs/heads/', '');
  } catch {
    // Fallback to 'main' if remote HEAD not found
    return 'main';
  }
}

// ---------------------------------------------------------------------------
// Worktree scaffolding helper
// ---------------------------------------------------------------------------

type WorktreeScaffoldResult =
  | { ok: true }
  | { ok: false; kind: 'checkedOutInMainRepo' }
  | { ok: false; kind: 'checkedOutElsewhere' }
  | { ok: false; kind: 'createFailed'; outerMessage: string; innerMessage: string };

/**
 * Ensure the worktrees directory exists and, if the worktree path is absent,
 * create it via `git worktree add`.  Returns a discriminated result so callers
 * can produce their own exact error messages.
 *
 * Preconditions: session fields `worktree_path`, `branch_name`, `base_branch`
 * must already be set; `repoPath` is the path of the primary checkout.
 */
async function _scaffoldWorktree(params: {
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  repoPath: string;
}): Promise<WorktreeScaffoldResult> {
  const { worktreePath, branchName, baseBranch, repoPath } = params;

  // Ensure the parent worktrees directory exists
  const worktreesDir = path.dirname(worktreePath);
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Nothing to do — worktree already present
  if (fs.existsSync(worktreePath)) {
    return { ok: true };
  }

  // Guard: never shadow the primary checkout's current branch
  const checkedOut = await getCurrentBranch(repoPath);
  if (checkedOut && checkedOut === branchName) {
    return { ok: false, kind: 'checkedOutInMainRepo' };
  }

  try {
    // Attempt to create a new branch from base
    await gitExec(
      ['worktree', 'add', '-b', branchName, worktreePath, baseBranch],
      { cwd: repoPath }
    );
    return { ok: true };
  } catch (outerError) {
    const outerMessage = outerError instanceof Error ? outerError.message : String(outerError);
    // Branch may already exist — retry without -b
    try {
      await gitExec(
        ['worktree', 'add', worktreePath, branchName],
        { cwd: repoPath }
      );
      return { ok: true };
    } catch (innerError) {
      const innerMessage = innerError instanceof Error ? innerError.message : String(innerError);
      if (innerMessage.includes('already checked out')) {
        return { ok: false, kind: 'checkedOutElsewhere' };
      }
      return { ok: false, kind: 'createFailed', outerMessage, innerMessage };
    }
  }
}

async function assertSessionWorktreeCheckout(params: {
  session: DevSession;
  repoPath: string;
}): Promise<ServiceResult<{ cwd: string }>> {
  const { session, repoPath } = params;
  const expectedWorktreePath = path.resolve(session.worktree_path);
  const primaryRepoPath = path.resolve(repoPath);

  if (!fs.existsSync(expectedWorktreePath)) {
    return failure(`Cannot use session worktree: path does not exist at ${expectedWorktreePath}`);
  }

  const [resolvedWorktreePath, resolvedPrimaryRepoPath] = await Promise.all([
    fs.promises.realpath(expectedWorktreePath),
    fs.promises.realpath(primaryRepoPath),
  ]);

  if (resolvedWorktreePath === resolvedPrimaryRepoPath) {
    return failure(
      `Refusing task run: session worktree resolves to the primary checkout (${resolvedPrimaryRepoPath}).`
    );
  }

  const { stdout: topLevelStdout } = await gitExec(['rev-parse', '--show-toplevel'], {
    cwd: resolvedWorktreePath,
  });
  const gitTopLevel = await fs.promises.realpath(topLevelStdout.trim());
  if (gitTopLevel !== resolvedWorktreePath) {
    return failure(
      `Refusing task run: git cwd resolved to ${gitTopLevel}, expected session worktree ${resolvedWorktreePath}.`
    );
  }

  const currentBranch = await getCurrentBranch(resolvedWorktreePath);
  if (currentBranch !== session.branch_name) {
    return failure(
      `Refusing task run: ${resolvedWorktreePath} is on branch '${currentBranch ?? 'detached HEAD'}', ` +
      `expected '${session.branch_name}'.`
    );
  }

  return success({ cwd: resolvedWorktreePath });
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--verify', ref], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the lower bound for a session's commit/diff range. Prefers the
 * immutable fork-point SHA captured when the worktree was created. For legacy
 * rows without a stored SHA, falls back to the merge-base with the current base
 * branch, then to the upstream-resolved base branch name.
 */
async function resolveSessionBaseRef(session: DevSession): Promise<string> {
  if (session.base_sha) {
    return session.base_sha;
  }
  try {
    return await getMergeBase(session.worktree_path, session.base_branch);
  } catch {
    return resolveUpstreamBranch(session.worktree_path, session.base_branch);
  }
}

/**
 * Build rev-list/log arguments for commits that belong to this session. The
 * stored base SHA keeps legacy fork-point attribution stable, while `--not
 * <current-upstream>` removes base-branch commits that entered the task branch
 * through a rebase/fast-forward after the session was created.
 */
async function resolveSessionCommitRangeArgs(session: DevSession): Promise<string[]> {
  const baseRef = await resolveSessionBaseRef(session);
  const args = [`${baseRef}..HEAD`];

  if (!session.base_sha || !session.base_branch) {
    return args;
  }

  const currentBaseRef = await resolveUpstreamBranch(session.worktree_path, session.base_branch);
  if (currentBaseRef && (await refExists(session.worktree_path, currentBaseRef))) {
    args.push('--not', currentBaseRef);
  }

  return args;
}

export function createDevSessionService(deps: DevSessionServiceDeps) {
  function getAgentContextInput(planItemId: string): ServiceResult<AgentContextInput> {
    const item = deps.planItems.get(planItemId);
    if (!item) {
      return failure(`Plan item not found: ${planItemId}`);
    }

    if (!item.project_id) {
      return failure(`Plan item has no project: ${planItemId}`);
    }

    const project = deps.projects.get(item.project_id);
    if (!project) {
      return failure(`Project not found: ${item.project_id}`);
    }

    const allItems = deps.planItems.getByProject(project.id);
    const children = allItems.filter((candidate) => candidate.parent_id === planItemId);
    const parent = item.parent_id ? deps.planItems.get(item.parent_id) ?? null : null;

    return success({
      item,
      project,
      children,
      parent,
    });
  }

  const service = {
    /**
     * Get all sessions for a project
     */
    getByProject(projectId: string): DevSession[] {
      return deps.devSessions.getByProject(projectId);
    },

    /**
     * Get sessions with plan item data for display
     */
    getByProjectWithPlanItems(projectId: string): DevSessionWithPlanItem[] {
      const sessions = deps.devSessions.getByProjectWithPlanItems(projectId);
      const sessionIds = sessions.map((session) => session.id);
      const latestReviews = deps.agentReviews.getLatestByImplementationSessionIds(sessionIds);
      const latestReviewBySessionId = new Map(
        latestReviews.map((review) => [review.implementation_session_id, review])
      );
      const reviewerAgentsBySessionId =
        deps.agentReviews.getReviewerAgentsByImplementationSessionIds(sessionIds);

      return sessions.map((session) => ({
        ...session,
        latest_agent_review: latestReviewBySessionId.get(session.id) ?? null,
        reviewer_agents_seen: reviewerAgentsBySessionId.get(session.id) ?? [],
      }));
    },

    /**
     * Get active sessions for a project
     */
    getActiveSessions(projectId: string): DevSession[] {
      return deps.devSessions.getActiveSessions(projectId);
    },

    /**
     * Get a session by ID
     */
    get(id: string): DevSession | undefined {
      return deps.devSessions.get(id);
    },

    updateAutomationPhase(sessionId: string, phase: DevSession['automation_phase']): void {
      deps.devSessions.updateAutomationPhase(sessionId, phase);
      const updatedSession = deps.devSessions.get(sessionId);
      if (updatedSession) {
        broadcastSessionStatusChange(updatedSession);
      }
    },

    clearManualCommitInterruption(sessionId: string): void {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return;
      }

      const nextPhase = automationPhaseAfterManualCommitResolution(session.automation_phase);
      if (nextPhase !== session.automation_phase) {
        service.updateAutomationPhase(sessionId, nextPhase);
      }
    },

    /**
     * Acknowledge an "Automation interrupted" banner the user considers fine.
     * Only acts on `needs_attention` (the interrupted state) and returns the
     * session to `idle` — it does not re-run the agent or commit. The worktree
     * is left untouched, so any uncommitted manual work is preserved.
     */
    dismissAutomationInterruption(sessionId: string): void {
      const session = deps.devSessions.get(sessionId);
      if (session?.automation_phase !== 'needs_attention') {
        return;
      }

      service.updateAutomationPhase(sessionId, 'idle');
    },

    markLatestAgentReviewStale(sessionId: string): void {
      deps.agentReviews.markLatestCompletedStale(sessionId);
    },

    /**
     * Check if a plan item has an active session
     */
    hasActiveSession(planItemId: string): boolean {
      return !!deps.devSessions.getActiveByPlanItem(planItemId);
    },

    /**
     * Open a session's worktree in the user's code editor.
     */
    async openInEditor(sessionId: string): AsyncResult<void> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!session.worktree_path) {
          return failure('Session has no worktree path');
        }

        if (!fs.existsSync(session.worktree_path)) {
          return failure(`Worktree path does not exist: ${session.worktree_path}`);
        }

        await openDirectoryInCodeEditor(session.worktree_path);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get the most recent session for a plan item, regardless of status.
     * Used by board execution to continue previous work instead of silently
     * creating a brand new session/worktree.
     */
    getLatestSessionForPlanItem(planItemId: string): DevSession | undefined {
      return deps.devSessions.getByPlanItem(planItemId);
    },

    /**
     * Compute the merge order for all sessions in a project from the plan
     * dependency graph (user overrides win over the computed layer).
     */
    getMergeOrder(projectId: string): Record<string, MergeOrderEntry> {
      const sessions = deps.devSessions.getByProject(projectId);
      const relations = deps.planRelations.getByProject(projectId);
      return Object.fromEntries(computeMergeOrder(sessions, relations));
    },

    /**
     * Build the structured prompt used when a board action starts a session.
     * This keeps board launches aligned with the richer plan-item execution path.
     */
    buildBoardStartInstructions(
      planItemId: string,
      userPrompt?: string
    ): ServiceResult<string> {
      const contextResult = getAgentContextInput(planItemId);
      if (!contextResult.ok) {
        return contextResult;
      }

      return success(buildBoardStartInstructions({
        ...contextResult.data,
        userPrompt,
      }));
    },

    /**
     * Resolve any @plan/<uuid> tokens in agent launch prompts or attached
     * context files so board agents receive the referenced plan item state.
     */
    buildPlanRefSection(projectId: string, content: string): string {
      if (!content) return '';
      const items = deps.planItems.getByProject(projectId);
      return formatPlanRefSection(content, items);
    },

    /**
     * Board entry point: reuse the latest pending/inactive session for the
     * plan item (same repo) or create a new pending session, then start the
     * agent with the augmented prompt (context files + plan refs + instructions).
     */
    async createAndStartFromBoard(input: {
      planItemId: string;
      repoId: string;
      prompt?: string;
      baseBranch?: string;
      contextPaths?: string[];
      effort?: AgentEffortLevel;
      environmentMode?: RepoEnvironmentMode;
      executionMode?: AgentExecutionMode;
      reviewPolicy?: AgentReviewPolicy;
    }): AsyncResult<{ session: DevSession }> {
      const executionMode = input.executionMode ?? 'standard';
      const reviewPolicy = input.reviewPolicy ?? 'auto';
      const instructionsResult = service.buildBoardStartInstructions(input.planItemId, input.prompt);
      if (!instructionsResult.ok) {
        return instructionsResult;
      }
      const instructions = instructionsResult.data;

      let sessionId: string;
      let projectId: string;

      const existing = deps.devSessions.getByPlanItem(input.planItemId);
      if (
        existing?.repo_id === input.repoId
        && (existing.status === 'inactive' || existing.status === 'pending')
      ) {
        sessionId = existing.id;
        projectId = existing.project_id;
        deps.devSessions.updateWorkflowControls(sessionId, executionMode, reviewPolicy);
      } else {
        const createResult = await service.createPendingSession(
          input.planItemId,
          input.repoId,
          instructions,
          { baseBranch: input.baseBranch, executionMode, reviewPolicy },
        );
        if (!createResult.ok) {
          return createResult;
        }
        sessionId = createResult.data.id;
        projectId = createResult.data.project_id;
      }

      const prefixResult = input.contextPaths?.length
        ? await deps.buildContextPrefix(projectId, input.contextPaths)
        : null;
      const contextPrefix = prefixResult?.ok ? prefixResult.data : '';
      const baseAugmented = contextPrefix + instructions;
      const augmentedPrompt = service.buildPlanRefSection(projectId, baseAugmented) + baseAugmented;

      return service.startAgentSession(sessionId, {
        prompt: augmentedPrompt,
        effort: input.effort,
        environmentMode: input.environmentMode,
        executionMode,
      });
    },

    /**
     * Create a pending session (awaiting user approval)
     */
    async createPendingSession(
      planItemId: string,
      repoId: string,
      instructions: string,
      options?: {
        freshStart?: boolean;
        baseBranch?: string;
        executionMode?: AgentExecutionMode;
        reviewPolicy?: AgentReviewPolicy;
      }
    ): AsyncResult<DevSession> {
      try {
        // Validate plan item exists
        const item = deps.planItems.get(planItemId);
        if (!item) {
          return failure(`Plan item not found: ${planItemId}`);
        }

        // Validate repo exists
        const repo = deps.repos.getById(repoId);
        if (!repo) {
          return failure(`Repository not found: ${repoId}`);
        }

        // Check for existing active session (unless freshStart is requested)
        if (!options?.freshStart) {
          const existing = deps.devSessions.getActiveByPlanItem(planItemId);
          if (existing) {
            return failure(`Plan item already has an active session: ${existing.id}`);
          }
        }

        // Use provided base branch or detect the default
        const baseBranch = options?.baseBranch ?? await detectDefaultBranch(repo.path);

        // Generate branch name and worktree path
        const template = deps.appSettings.get('branch_name_template');
        const baseBranchName = generateBranchName(item, template);
        // If freshStart, generate a unique branch name (adds -v2, -v3, etc.)
        const branchName = options?.freshStart
          ? await generateUniqueBranchName(repo.path, baseBranchName)
          : baseBranchName;
        const worktreesDir = getWorktreesDir(repo.path);
        const worktreePath = path.join(worktreesDir, branchName.replace(/\//g, '-'));

        const session = deps.devSessions.create({
          id: randomUUID(),
          project_id: item.project_id!,
          plan_item_id: planItemId,
          repo_id: repoId,
          name: item.title,
          worktree_path: worktreePath,
          branch_name: branchName,
          base_branch: baseBranch,
          // Captured once the worktree (and its fork point) actually exists,
          // in startAgentSession after _scaffoldWorktree.
          base_sha: null,
          status: 'pending',
          agent_type: 'claude',
          execution_mode: options?.executionMode ?? 'standard',
          review_policy: options?.reviewPolicy ?? 'auto',
          automation_phase: null,
          initial_instructions: instructions,
          pr_number: null,
          pr_url: null,
          pr_state: null,
          review_state: null,
          merge_order: null,
        });

        // Broadcast new session to UI
        broadcastSessionStatusChange(session);

        return success(session);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Start a session using the Agent SDK (no PTY).
     * Used by the board-driven execution flow.
     * Creates worktree, builds prompt, then delegates to AgentSessionManager.
     */
    async startAgentSession(
      sessionId: string,
      options?: {
        prompt?: string;
        effort?: AgentEffortLevel;
        environmentMode?: RepoEnvironmentMode;
        executionMode?: AgentExecutionMode;
      },
    ): AsyncResult<{ session: DevSession }> {
      try {
        if (!deps.agentSessionManager) {
          return failure('Agent session manager is not available');
        }

        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (session.status !== 'pending' && session.status !== 'inactive') {
          return failure(`Session is not in a startable state: ${session.status}`);
        }

        const repo = deps.repos.getById(session.repo_id);
        if (!repo) {
          return failure(`Repository not found: ${session.repo_id}`);
        }

        // Create worktree directory (if needed) and git worktree
        const scaffoldResult = await _scaffoldWorktree({
          worktreePath: session.worktree_path,
          branchName: session.branch_name,
          baseBranch: session.base_branch,
          repoPath: repo.path,
        });
        if (!scaffoldResult.ok) {
          if (scaffoldResult.kind === 'checkedOutInMainRepo') {
            return failure(
              `Branch '${session.branch_name}' is currently checked out in the main repository. ` +
              `Switch to a different branch or choose a different branch for this session.`
            );
          }
          if (scaffoldResult.kind === 'checkedOutElsewhere') {
            return failure(
              `Branch '${session.branch_name}' is already checked out in another worktree.`
            );
          }
          return failure(`Failed to create worktree: ${scaffoldResult.innerMessage}`);
        }

        const worktreeGuard = await assertSessionWorktreeCheckout({
          session,
          repoPath: repo.path,
        });
        if (!worktreeGuard.ok) {
          return worktreeGuard;
        }
        const worktreeCwd = worktreeGuard.data.cwd;

        // Capture the immutable fork-point SHA once, now that the worktree
        // exists. Commit/diff views range against this so a task's "Changes"
        // reflect only its own work — never commits that landed on a moving
        // base ref (e.g. local main advancing while origin/main lags).
        if (!session.base_sha) {
          const baseSha = await resolveBaseSha(worktreeCwd, session.base_branch);
          if (baseSha) {
            deps.devSessions.updateBaseSha(sessionId, baseSha);
            session.base_sha = baseSha;
          }
        }

        // Capture repo environment (direnv / auto-detect) after worktree is ready
        const capturedEnv = await captureRepoEnvironment(
          options?.environmentMode ?? repo.environment_mode ?? 'auto',
          worktreeCwd,
        );

        // Use the user's prompt override if provided, otherwise the stored instructions
        const executionMode = options?.executionMode ?? session.execution_mode ?? 'standard';
        const prompt = buildExecutionPrompt(options?.prompt || session.initial_instructions, executionMode);

        deps.agentReviews.markLatestCompletedStale(sessionId);
        deps.devSessions.updateAutomationPhase(sessionId, 'idle');

        const developerModel = resolveBoardModel(executionMode, session.agent_type);
        const effectiveEffort = resolveBoardEffort(developerModel, options?.effort, executionMode);
        const sdkSettings = buildBoardSdkSettings(executionMode, effectiveEffort);
        const disallowedTools = executionMode === 'workflow'
          ? ['AskUserQuestion']
          : ['AskUserQuestion', 'Workflow'];

        // Build SDK options for the dev session
        // Dev sessions use a minimal config — no KPM MCP server, no plan tools
        const sdkOptions: SDKOptions = {
          systemPrompt: deps.getPromptContent('agents.implementation_system'),
          model: developerModel,
          cwd: worktreeCwd,
          maxTurns: getConfig().claude.maxTurns,
          permissionMode: getConfig().claude.defaultPermissionMode,
          // Board agents are one-shot — never pause for the built-in
          // option-picker; the agent proceeds on assumptions instead.
          disallowedTools,
          settings: sdkSettings,
          skills: [],
          env: { ...process.env, ...capturedEnv, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
          thinking: { type: 'adaptive' as const, display: 'summarized' as const },
          agentProgressSummaries: true,
          ...(effectiveEffort && { effort: effectiveEffort }),
          ...getClaudeSdkSpawnOptions(),
        };

        // Create the agent session via the manager
        const agentSession = deps.agentSessionManager.create({
          devSessionId: sessionId,
          projectId: session.project_id,
          agentType: session.agent_type,
          role: 'implement',
          sdkOptions: session.agent_type === 'claude' ? sdkOptions : undefined,
          model: session.agent_type === 'codex' ? getConfig().agentSession.codexModel : undefined,
        });

        // Update DB status to active
        deps.devSessions.updateStatus(sessionId, 'active');
        const updatedSession = deps.devSessions.get(sessionId)!;
        broadcastSessionStatusChange(updatedSession);

        // Start the agent session asynchronously
        agentSession.start(worktreeCwd, prompt).catch(async (error) => {
          console.error(`[DevSessionService] Agent session start failed for ${sessionId}:`, error);
          try {
            await agentSession.stop();
          } catch (stopError) {
            console.warn(`[DevSessionService] Failed to stop failed agent session ${sessionId}:`, stopError);
          } finally {
            deps.agentSessionManager?.remove(agentSession.id);
          }
          deps.devSessions.updateStatus(sessionId, 'inactive');
          const failedSession = deps.devSessions.get(sessionId);
          if (failedSession) {
            broadcastSessionStatusChange(failedSession);
          }
        });

        return success({ session: updatedSession });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async sendAgentFollowUp(
      sessionId: string,
      text: string,
      options?: { restartIfBusy?: boolean },
    ): AsyncResult<{ restarted: boolean; deferred?: boolean }> {
      try {
        if (!deps.agentSessionManager) {
          return failure('Agent session manager is not available');
        }

        const activeSession = deps.agentSessionManager.getByDevSession(sessionId);
        if (activeSession) {
          deps.agentReviews.markLatestCompletedStale(sessionId);
          try {
            await activeSession.followUp(text);
            return success({ restarted: false });
          } catch (followUpError) {
            // followUp() rejects when the session is in a non-terminal state (e.g. 'working').
            // This can happen if the session was resumed externally. Fall through to restart.
            const followUpMessage = followUpError instanceof Error ? followUpError.message : String(followUpError);
            if (options?.restartIfBusy === false && followUpMessage.startsWith('Cannot follow up in state:')) {
              return success({ restarted: false, deferred: true });
            }
            console.warn(`[DevSessionService] followUp() failed for ${sessionId}, will restart:`, followUpError);
          }
        }

        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (session.status === 'active') {
          deps.devSessions.updateStatus(sessionId, 'inactive');
        }

        const restartPrompt = [
          'Resume work on this existing implementation task.',
          '',
          'Original task:',
          session.initial_instructions || 'No original task description was stored.',
          '',
          'Follow-up request:',
          text,
        ].join('\n');

        const startResult = await service.startAgentSession(sessionId, { prompt: restartPrompt });
        if (!startResult.ok) {
          return failure(startResult.error);
        }

        return success({ restarted: true });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async requestCommitHookRepair(
      sessionId: string,
      hookOutput: string,
    ): AsyncResult<{ started: boolean; alreadyAttempted: boolean }> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (isCommitHookRepairPhase(session.automation_phase)) {
          service.updateAutomationPhase(sessionId, 'needs_attention');
          return success({ started: false, alreadyAttempted: true });
        }

        service.updateAutomationPhase(
          sessionId,
          commitHookRepairPhaseFor(session.automation_phase),
        );

        const followUpResult = await service.sendAgentFollowUp(
          sessionId,
          buildCommitHookRepairPrompt(hookOutput),
        );

        if (!followUpResult.ok) {
          service.updateAutomationPhase(sessionId, 'needs_attention');
          return failure(followUpResult.error);
        }

        return success({ started: true, alreadyAttempted: false });
      } catch (error) {
        service.updateAutomationPhase(sessionId, 'needs_attention');
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Update session status
     */
    updateStatus(sessionId: string, status: DevSessionStatus): void {
      deps.devSessions.updateStatus(sessionId, status);

      // Broadcast status change to UI
      const updatedSession = deps.devSessions.get(sessionId);
      if (updatedSession) {
        broadcastSessionStatusChange(updatedSession);
      }
    },

    /**
     * Check if a session's worktree has uncommitted changes
     * Used to warn before deletion
     */
    async checkDirty(
      sessionId: string
    ): AsyncResult<{ isDirty: boolean; files: string[] }> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        // If worktree doesn't exist, nothing to lose
        if (!fs.existsSync(session.worktree_path)) {
          return success({ isDirty: false, files: [] });
        }

        // Check for uncommitted changes using git status --porcelain
        const { stdout } = await gitExec(
          ['status', '--porcelain'],
          { cwd: session.worktree_path }
        );

        const files = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => line.slice(3)); // Remove status prefix (e.g., " M ", "?? ")

        return success({ isDirty: files.length > 0, files });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Delete a session (removes record, optionally cleans worktree).
     * This is the unified action for stopping/removing sessions.
     */
    async deleteSession(
      sessionId: string,
      cleanupWorktree = true
    ): AsyncResult<void> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        // Clean up worktree if requested and it exists
        if (cleanupWorktree && fs.existsSync(session.worktree_path)) {
          const repo = deps.repos.getById(session.repo_id);
          if (repo) {
            try {
              await gitExec(
                ['worktree', 'remove', session.worktree_path, '--force'],
                { cwd: repo.path }
              );
            } catch {
              // If worktree remove fails, try manual cleanup
              fs.rmSync(session.worktree_path, { recursive: true, force: true });
              await gitExec(['worktree', 'prune'], { cwd: repo.path });
            }
          }
        }

        // Delete session record
        deps.devSessions.delete(sessionId);

        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Destroy a session completely - removes worktree, force-deletes local branch,
     * and deletes the remote tracking branch. Intended for discarding unwanted work.
     */
    async destroySession(sessionId: string): AsyncResult<void> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        const repo = deps.repos.getById(session.repo_id);
        if (repo) {
          // Force-remove git worktree
          if (fs.existsSync(session.worktree_path)) {
            try {
              await gitExec(
                ['worktree', 'remove', session.worktree_path, '--force'],
                { cwd: repo.path }
              );
            } catch {
              // If worktree remove fails, try manual cleanup
              fs.rmSync(session.worktree_path, { recursive: true, force: true });
              await gitExec(['worktree', 'prune'], { cwd: repo.path });
            }
          }

          // Force-delete local branch (ignores merge status)
          try {
            await gitExec(
              ['branch', '-D', session.branch_name],
              { cwd: repo.path }
            );
          } catch {
            // Branch may already be deleted
          }

          // Delete remote tracking branch
          try {
            await gitExec(
              ['push', 'origin', '--delete', session.branch_name],
              { cwd: repo.path }
            );
          } catch {
            // Remote branch may not exist
          }
        }

        // Delete session record
        deps.devSessions.delete(sessionId);

        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get git diff for a session's worktree
     */
    async getSessionDiff(sessionId: string): AsyncResult<string> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!fs.existsSync(session.worktree_path)) {
          return failure(`Worktree not found: ${session.worktree_path}`);
        }

        // Show only truly uncommitted changes (staged + unstaged vs HEAD).
        // Committed branch changes are visible via the commit list below.
        const { stdout } = await gitExec(
          ['diff', 'HEAD'],
          { cwd: session.worktree_path, maxBuffer: 10 * 1024 * 1024 }
        );

        return success(stdout);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    /**
     * Get commit count ahead of base branch
     */
    async getCommitsAhead(sessionId: string): AsyncResult<number> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }

        if (!fs.existsSync(session.worktree_path)) {
          return success(0);
        }

        const rangeArgs = await resolveSessionCommitRangeArgs(session);
        const { stdout } = await gitExec(
          ['rev-list', '--count', ...rangeArgs],
          { cwd: session.worktree_path }
        );

        return success(parseInt(stdout.trim(), 10) || 0);
      } catch {
        return success(0);
      }
    },

    /**
     * Commit uncommitted changes in the session's worktree.
     *
     * Stages all changes and commits once. If pre-commit hooks rewrite files
     * and exit non-zero (prettier/eslint/lefthook pattern), re-stages and
     * retries once — mirrors the /commit skill's conversational retry.
     */
    async commitSessionChanges(
      sessionId: string,
      message: string,
    ): AsyncResult<{ sha: string }> {
      const session = deps.devSessions.get(sessionId);
      if (!session) {
        return failure(`Session not found: ${sessionId}`);
      }
      const repo = deps.repos.getById(session.repo_id);
      if (!repo) {
        return failure(`Repository not found: ${session.repo_id}`);
      }
      const target = await assertSessionWorktreeCheckout({ session, repoPath: repo.path });
      if (!target.ok) {
        return target;
      }
      const cwd = target.data.cwd;

      const extractSha = (stdout: string): string => {
        const shaMatch = /\[[\w/.-]+ ([0-9a-f]{7,})\]/.exec(stdout);
        return shaMatch?.[1] ?? '';
      };

      const isNothingToCommit = (err: unknown): boolean => {
        const stderr = (err as { stderr?: string }).stderr ?? '';
        const stdout = (err as { stdout?: string }).stdout ?? '';
        return stderr.includes('nothing to commit') || stdout.includes('nothing to commit');
      };

      const hookChangedWorktree = async (): Promise<boolean> => {
        try {
          const { stdout } = await gitExec(['status', '--porcelain'], { cwd });
          return stdout.split(/\r?\n/).some((line) => {
            if (!line) return false;
            if (line.startsWith('??')) return true;
            return line.length > 1 && line[1] !== ' ';
          });
        } catch {
          return false;
        }
      };

      try {
        await gitExec(['add', '-A'], { cwd });
        try {
          const { stdout } = await gitExec(['commit', '-m', message], { cwd });
          return success({ sha: extractSha(stdout) });
        } catch (firstErr) {
          if (isNothingToCommit(firstErr)) {
            return failure('Nothing to commit — working tree is clean');
          }
          if (await hookChangedWorktree()) {
            // Pre-commit hooks can auto-fix files and exit non-zero to force
            // re-staging. Retry only when the hook actually changed files.
            await gitExec(['add', '-A'], { cwd });
            const { stdout } = await gitExec(['commit', '-m', message], { cwd });
            return success({ sha: extractSha(stdout) });
          }
          return failure(formatGitExecError(firstErr));
        }
      } catch (err) {
        if (isNothingToCommit(err)) {
          return failure('Nothing to commit — working tree is clean');
        }
        return failure(formatGitExecError(err));
      }
    },

    /**
     * Get the commit log (commits ahead of base branch) for a session's worktree.
     */
    async getSessionCommitLog(
      sessionId: string,
    ): AsyncResult<{ sha: string; subject: string; authorName: string; date: string }[]> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }
        if (!fs.existsSync(session.worktree_path)) {
          return success([]);
        }

        const SEP = '\x1f';
        const rangeArgs = await resolveSessionCommitRangeArgs(session);
        const { stdout } = await gitExec(
          ['log', ...rangeArgs, `--format=%h${SEP}%s${SEP}%aN${SEP}%aI`],
          { cwd: session.worktree_path },
        );

        const commits = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [sha, subject, authorName, date] = line.split(SEP);
            return {
              sha: sha ?? '',
              subject: subject ?? '',
              authorName: authorName ?? '',
              date: date ?? '',
            };
          });

        return success(commits);
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    },

    /**
     * Get per-file additions/deletions for a single commit in a session's worktree.
     */
    async getSessionCommitFiles(
      sessionId: string,
      sha: string,
    ): AsyncResult<{ additions: number; deletions: number; path: string }[]> {
      try {
        const session = deps.devSessions.get(sessionId);
        if (!session) {
          return failure(`Session not found: ${sessionId}`);
        }
        if (!fs.existsSync(session.worktree_path)) {
          return success([]);
        }

        const { stdout } = await gitExec(
          ['show', '--numstat', '--format=', sha],
          { cwd: session.worktree_path },
        );

        const files = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('\t');
            return {
              additions: parseInt(parts[0] ?? '0', 10) || 0,
              deletions: parseInt(parts[1] ?? '0', 10) || 0,
              path: parts[2] ?? '',
            };
          })
          .filter((f) => f.path);

        return success(files);
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    },

    /**
     * Update session name
     */
    updateName(sessionId: string, name: string): void {
      deps.devSessions.updateName(sessionId, name);
    },

    /**
     * Update user-explicit merge order override (null = derive from plan graph)
     */
    updateMergeOrder(sessionId: string, order: number | null): void {
      deps.devSessions.updateMergeOrder(sessionId, order);
    },

    /**
     * Mark all active sessions as inactive (called on app startup)
     */
    markActiveAsInactive(): void {
      deps.devSessions.markActiveAsInactive();
    },
  };

  return service;
}

// =============================================================================
// Type Export
// =============================================================================

export type DevSessionService = ReturnType<typeof createDevSessionService>;
