/**
 * Auto-Review Pipeline
 *
 * When an implementation agent completes, this module can spawn an opposing
 * agent to review the changes. The review agent produces structured findings
 * (ReviewFinding[]) without editing files.
 *
 * Agent mapping:
 *   claude  → review with codex (or claude if codex unavailable)
 *   codex   → review with claude
 *   gemini  → review with claude
 *   pi      → review with claude
 */

import { getConfig } from '../../config';
import { getDiff, gitExec } from '../repo/gitUtils';
import type { AgentType } from '../../../shared/agent-types';
import type { AgentEffortLevel, RepoEnvironmentMode } from '../../../shared/types';
import {
  boardProviderRefusal,
  createBoardAgentSession,
  isBoardRunnableProvider,
} from './agentLaunch';
import { toReviewSessionId } from '../../../shared/agent-types';
import { getReviewOpponent, isAgentAvailable } from './agentCatalog';
import { hasCodexAuth } from '../../codex/auth';
import type { AgentSessionManager } from './AgentSessionManager';

const LOG_PREFIX = '[AutoReview]';

// Static output format appended to every review prompt regardless of user customizations.
// parseReviewFindings() (see reviewOutputContract.ts) depends on this exact shape —
// do not make it user-editable.
export const REVIEW_OUTPUT_FORMAT = `Return ONLY a JSON object with this shape:
- findings: an array of finding objects

Each finding should have:
- severity: "critical" | "warning" | "suggestion"
- file: the file path, when applicable
- line: the line number, or null when not applicable
- description: the concrete issue, why it matters, and the smallest reasonable fix direction

Severity guide: critical = a correctness, security, or data-loss problem that must be fixed before merging; warning = a real problem worth fixing in this change, including a broken documented repository standard or a missing or wrong requirement; suggestion = a judgement call (naming, a possible code smell, an optional simplification) the implementer may reasonably decline.

Return ONLY the JSON object, no other text. If there are no issues, return \`{"findings":[]}\`.

Example:
\`\`\`json
{
  "findings": [
    { "severity": "critical", "file": "src/auth.ts", "line": 42, "description": "Password comparison uses == instead of constant-time comparison, vulnerable to timing attacks. Use crypto.timingSafeEqual instead." },
    { "severity": "warning", "file": "src/api.ts", "line": 17, "description": "Error from external call is swallowed — callers receive undefined instead of a failure signal. Return the error or rethrow." },
    { "severity": "suggestion", "description": "The verification command failed in an integration environment outside a single source line. Re-run the integration test after fixing the setup." }
  ]
}
\`\`\``;

/**
 * Build the review prompt. Review criteria live on the system prompt
 * (`agents.review_system`); this user message carries the task, diff, and the
 * static output format that `parseReviewFindings` requires.
 */
function buildReviewPrompt(taskDescription: string, diff: string): string {
  return `## Task that was implemented
${taskDescription}

## Changes (git diff)
\`\`\`diff
${diff}
\`\`\`

${REVIEW_OUTPUT_FORMAT}`;
}

/**
 * Pathspecs excluded from the review diff. These are machine-generated, locked,
 * or vendored artifacts a reviewer should not read line-by-line: including them
 * burns the context budget and invites findings on code no human wrote.
 *
 * Deliberately conservative — only files that are unambiguously generated. Two
 * things keep this from blinding the reviewer: per-hunk context lines stay at
 * git's default (we never pass -U0), and the review agent runs in the worktree
 * (read-only), so it can open any excluded file directly when it needs more than
 * the diff shows. Extend this list rather than trimming the diff another way.
 */
const REVIEW_DIFF_EXCLUDES: readonly string[] = [
  // Dependency lockfiles
  ':(exclude,glob)**/package-lock.json',
  ':(exclude,glob)**/yarn.lock',
  ':(exclude,glob)**/pnpm-lock.yaml',
  ':(exclude,glob)**/Cargo.lock',
  ':(exclude,glob)**/poetry.lock',
  ':(exclude,glob)**/Gemfile.lock',
  ':(exclude,glob)**/composer.lock',
  ':(exclude,glob)**/go.sum',
  // Built / minified output and source maps
  ':(exclude,glob)**/*.min.js',
  ':(exclude,glob)**/*.min.css',
  ':(exclude,glob)**/*.map',
  // Test snapshots (generated blobs, not hand-written tests)
  ':(exclude,glob)**/*.snap',
  // Generated / vendored directories
  ':(exclude,glob)**/node_modules/**',
  ':(exclude,glob)**/dist/**',
  ':(exclude,glob)**/.next/**',
  ':(exclude,glob)**/coverage/**',
];

const REVIEW_DIFF_MAX_CHARS = 100_000;

/**
 * Cut an oversized diff and name every file the cut hid, including the one it
 * lands in, so the reviewer knows which files to open in the worktree instead
 * of reviewing a silently partial change.
 */
export function capReviewDiff(diff: string): string {
  if (diff.length <= REVIEW_DIFF_MAX_CHARS) return diff;
  const shown = diff.slice(0, REVIEW_DIFF_MAX_CHARS);
  const cutFileStart = shown.lastIndexOf('\ndiff --git ');
  const hidden = diff.slice(cutFileStart + 1);
  const files = [...hidden.matchAll(/^diff --git a\/(.+?) b\//gm)].map((match) => match[1]);
  return `${shown}\n\n... (diff truncated) These files are not shown in full; read them in the worktree:\n${files.map((file) => `- ${file}`).join('\n')}`;
}

/**
 * Get the diff for a worktree against the base branch.
 * Uses the base branch merge-base so committed and uncommitted task changes
 * are included without dragging in base commits from a rebased worktree.
 * Falls back to `git diff HEAD` (uncommitted only) when no base branch is provided.
 * Excludes generated/locked artifacts (see REVIEW_DIFF_EXCLUDES) but keeps full
 * per-hunk context.
 */
export async function getWorktreeDiff(worktreePath: string, baseBranch?: string | null): Promise<string> {
  const maxBuffer = 5 * 1024 * 1024; // 5MB
  const excludes = [...REVIEW_DIFF_EXCLUDES];
  try {
    if (baseBranch) {
      const diff = await getDiff(worktreePath, baseBranch, {
        excludePathspecs: excludes,
        maxChars: Number.POSITIVE_INFINITY,
      });
      if (diff.trim()) return capReviewDiff(diff);
    }
    // Fall back to uncommitted-only diff when no base branch or branch diff is empty
    const { stdout } = await gitExec(
      ['diff', 'HEAD', '--', '.', ...excludes],
      { cwd: worktreePath, maxBuffer },
    );
    return capReviewDiff(stdout);
  } catch {
    return '';
  }
}

async function startReviewSession(params: {
  reviewAgentType: AgentType;
  reviewSessionId: string;
  projectId: string;
  worktreePath: string;
  reviewPrompt: string;
  reviewSystemPrompt: string;
  agentSessionManager: AgentSessionManager;
  model?: string;
  effort?: AgentEffortLevel;
  writes?: boolean;
  expectsFindings?: boolean;
  environmentMode?: RepoEnvironmentMode;
  implementationSessionId?: string;
  stepId?: string;
  runIndex?: number;
}): Promise<void> {
  const { session, providerPrompt } = await createBoardAgentSession({
    sessionId: params.reviewSessionId,
    projectId: params.projectId,
    provider: params.reviewAgentType,
    role: 'subagent',
    worktreePath: params.worktreePath,
    systemPrompt: params.reviewSystemPrompt,
    taskPrompt: params.reviewPrompt,
    model: params.model,
    effort: params.effort,
    writes: params.writes ?? false,
    expectsFindings: params.expectsFindings,
    environmentMode: params.environmentMode,
    ...(params.implementationSessionId && params.stepId
      ? {
          relationship: {
            implementationSessionId: params.implementationSessionId,
            stepId: params.stepId,
            runIndex: params.runIndex ?? 0,
          },
        }
      : {}),
  }, params.agentSessionManager);

  await session.start(params.worktreePath, providerPrompt);
}

async function isReviewAgentAvailable(agentType: AgentType): Promise<boolean> {
  if (agentType === 'codex') {
    return hasCodexAuth();
  }
  return isAgentAvailable(agentType);
}

/**
 * Launch an opposing-agent auto-review for a completed implementation session.
 *
 * Returns the review agent session ID, or null if review couldn't be started.
 */
export async function launchAutoReview(params: {
  implementationSessionId: string;
  implementationAgentType: AgentType;
  worktreePath: string;
  /** Base branch to diff against (e.g. 'main'). Captures committed changes when provided. */
  baseBranch?: string | null;
  taskDescription: string;
  projectId: string;
  agentSessionManager: AgentSessionManager;
  /** Resolves configurable prompt content (override > registry default). */
  getPromptContent: (key: string) => string;
  /** Playbook step id this review's completion resolves back to. */
  stepId: string;
  /**
   * The reviewer the playbook step resolved to. Given one, it wins over the
   * opposing-agent default: a user who configured the review step expects that
   * provider and model to be what runs. Availability fallbacks still apply.
   */
  reviewer?: { provider: AgentType; model?: string; effort?: AgentEffortLevel };
}): Promise<string | null> {
  const {
    implementationSessionId,
    implementationAgentType,
    worktreePath,
    baseBranch,
    taskDescription,
    projectId,
    agentSessionManager,
    getPromptContent,
    stepId,
    reviewer,
  } = params;

  // Determine the review agent
  let reviewAgentType = reviewer?.provider ?? getReviewOpponent(implementationAgentType);

  // Check if the review agent is available; fall back to claude
  if (!await isReviewAgentAvailable(reviewAgentType)) {
    if (reviewAgentType !== 'claude' && await isReviewAgentAvailable('claude')) {
      console.log(`${LOG_PREFIX} ${reviewAgentType} not available, falling back to claude for review`);
      reviewAgentType = 'claude';
    } else {
      console.log(`${LOG_PREFIX} No review agent available, skipping auto-review`);
      return null;
    }
  }

  // For Codex, verify SDK credentials directly. The SDK binary is bundled, so
  // review availability is auth-based rather than PATH-based.
  if (reviewAgentType === 'codex' && !await hasCodexAuth()) {
    if (await isReviewAgentAvailable('claude')) {
      console.log(`${LOG_PREFIX} Codex not authenticated, falling back to claude for review`);
      reviewAgentType = 'claude';
    } else {
      console.log(`${LOG_PREFIX} Codex not authenticated and Claude unavailable, skipping auto-review`);
      return null;
    }
  }

  // Get the diff
  const diff = await getWorktreeDiff(worktreePath, baseBranch);
  if (!diff.trim()) {
    console.log(`${LOG_PREFIX} No changes to review for session ${implementationSessionId}`);
    return null;
  }

  const reviewSystemPrompt = getPromptContent('agents.review_system');
  const reviewPrompt = buildReviewPrompt(taskDescription, diff);

  // Create a review session ID (derived from implementation session)
  const reviewSessionId = toReviewSessionId(implementationSessionId);

  // A model id only means something to the provider it belongs to. Handing the
  // Codex model to a Claude reviewer (the usual opponent for a Codex
  // implementation) fails the run with "issue with the selected model". The
  // resolved reviewer's model only survives an unchanged provider for the same
  // reason.
  const model = reviewAgentType === reviewer?.provider
    ? reviewer.model
    : reviewAgentType === 'codex' ? getConfig().agentSession.codexModel : undefined;
  const effort = reviewAgentType === reviewer?.provider
    ? reviewer.effort
    : reviewAgentType === 'codex' ? getConfig().agentSession.codexEffort : undefined;

  try {
    await startReviewSession({
      reviewAgentType,
      reviewSessionId,
      projectId,
      worktreePath,
      reviewPrompt,
      reviewSystemPrompt,
      agentSessionManager,
      model,
      effort,
      writes: false,
      expectsFindings: true,
      implementationSessionId,
      stepId,
      runIndex: 0,
    });

    console.log(`${LOG_PREFIX} Started ${reviewAgentType} review for session ${implementationSessionId}`);
    return reviewSessionId;
  } catch (error) {
    if (reviewAgentType !== 'claude' && await isReviewAgentAvailable('claude')) {
      try {
        console.warn(`${LOG_PREFIX} ${reviewAgentType} review failed to start, falling back to claude`, error);
        await startReviewSession({
          reviewAgentType: 'claude',
          reviewSessionId,
          projectId,
          worktreePath,
          reviewPrompt,
          reviewSystemPrompt,
          agentSessionManager,
          writes: false,
          expectsFindings: true,
          implementationSessionId,
          stepId,
          runIndex: 0,
        });
        console.log(`${LOG_PREFIX} Started claude fallback review for session ${implementationSessionId}`);
        return reviewSessionId;
      } catch (fallbackError) {
        console.error(`${LOG_PREFIX} Claude fallback review also failed:`, fallbackError);
      }
    }
    console.error(`${LOG_PREFIX} Failed to start auto-review:`, error);
    return null;
  }
}

export function toPlaybookSubagentSessionId(
  implementationSessionId: string,
  stepId: string,
  attempt: number,
  runIndex: number,
): string {
  return `${implementationSessionId}-playbook-${stepId}-${attempt}-${runIndex}`;
}

/** Launch one resolved subagent run without silently substituting providers. */
export async function launchPlaybookSubagent(params: {
  implementationSessionId: string;
  stepId: string;
  runIndex: number;
  attempt: number;
  agent: { provider: string; model: string; effort?: AgentEffortLevel };
  worktreePath: string;
  baseBranch?: string | null;
  taskContext: string;
  directive: string;
  systemPrompt: string;
  verdict: boolean;
  writes: boolean;
  projectId: string;
  agentSessionManager: AgentSessionManager;
}): Promise<string> {
  const provider = params.agent.provider;
  if (!isBoardRunnableProvider(provider)) {
    throw new Error(boardProviderRefusal(provider));
  }
  const diff = await getWorktreeDiff(params.worktreePath, params.baseBranch);
  const contextPayload = [
    '## Task context',
    params.taskContext,
    '## Current changes (git diff)',
    `\`\`\`diff\n${diff}\n\`\`\``,
  ].join('\n\n');
  const prompt = (params.directive.trimStart().startsWith('/')
    ? [params.directive, contextPayload, params.verdict ? REVIEW_OUTPUT_FORMAT : '']
    : [contextPayload, params.directive, params.verdict ? REVIEW_OUTPUT_FORMAT : ''])
    .filter(Boolean).join('\n\n');
  const sessionId = toPlaybookSubagentSessionId(
    params.implementationSessionId,
    params.stepId,
    params.attempt,
    params.runIndex,
  );
  await startReviewSession({
    reviewAgentType: provider,
    reviewSessionId: sessionId,
    projectId: params.projectId,
    worktreePath: params.worktreePath,
    reviewPrompt: prompt,
    reviewSystemPrompt: `${params.systemPrompt}\n\n${params.writes ? 'You may edit files in the task worktree.' : 'This step is read-only. Do not modify files.'}`,
    agentSessionManager: params.agentSessionManager,
    model: params.agent.model,
    effort: params.agent.effort,
    writes: params.writes,
    expectsFindings: params.verdict,
    implementationSessionId: params.implementationSessionId,
    stepId: params.stepId,
    runIndex: params.runIndex,
  });
  return sessionId;
}
