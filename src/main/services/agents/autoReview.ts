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
 */

import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { getConfig } from '../../config';
import { getDiff, gitExec } from '../repo/gitUtils';
import type { AgentType } from '../../../shared/agent-types';
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

Severity guide: critical = correctness bug or security issue that must be fixed before merging; warning = likely problem worth addressing but not a blocker; suggestion = style, naming, or optimization that can safely be ignored.

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
      const diff = await getDiff(worktreePath, baseBranch, maxBuffer, excludes);
      if (diff.trim()) return diff;
    }
    // Fall back to uncommitted-only diff when no base branch or branch diff is empty
    const { stdout } = await gitExec(
      ['diff', 'HEAD', '--', '.', ...excludes],
      { cwd: worktreePath, maxBuffer },
    );
    return stdout;
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
  readOnly?: boolean;
  expectsFindings?: boolean;
  implementationSessionId?: string;
  stepId?: string;
  runIndex?: number;
}): Promise<void> {
  const {
    reviewAgentType,
    reviewSessionId,
    projectId,
    worktreePath,
    reviewPrompt,
    reviewSystemPrompt,
    agentSessionManager,
    model,
  } = params;

  const prompt = reviewAgentType === 'claude'
    ? reviewPrompt
    : `${reviewSystemPrompt}\n\n${reviewPrompt}`;

  if (reviewAgentType === 'claude') {
    const sdkOptions: SDKOptions = {
      systemPrompt: reviewSystemPrompt,
      model: model ?? getConfig().generation.fastModel,
      cwd: worktreePath,
      maxTurns: 5,
      permissionMode: getConfig().claude.defaultPermissionMode,
      // One-shot review agent — disable the built-in option-picker tool.
      disallowedTools: ['AskUserQuestion'],
      settingSources: ['user'],
      env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
      ...getClaudeSdkSpawnOptions(),
    };

    const session = agentSessionManager.create({
      devSessionId: reviewSessionId,
      projectId,
      agentType: 'claude',
      role: 'review',
      sdkOptions,
      readOnly: params.readOnly,
      expectsFindings: params.expectsFindings,
      implementationSessionId: params.implementationSessionId,
      stepId: params.stepId,
      runIndex: params.runIndex,
    });

    await session.start(worktreePath, reviewPrompt);
    return;
  }

  const session = agentSessionManager.create({
    devSessionId: reviewSessionId,
    projectId,
    agentType: reviewAgentType,
    role: 'review',
    model: reviewAgentType === 'codex' ? model : undefined,
    readOnly: params.readOnly,
    expectsFindings: params.expectsFindings,
    implementationSessionId: params.implementationSessionId,
    stepId: params.stepId,
    runIndex: params.runIndex,
  });

  await session.start(worktreePath, prompt);
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
  } = params;

  // Determine the review agent
  let reviewAgentType = getReviewOpponent(implementationAgentType);

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

  const codexModel = getConfig().agentSession.codexModel;

  try {
    await startReviewSession({
      reviewAgentType,
      reviewSessionId,
      projectId,
      worktreePath,
      reviewPrompt,
      reviewSystemPrompt,
      agentSessionManager,
      model: codexModel,
      readOnly: true,
      expectsFindings: true,
      implementationSessionId,
      stepId: 'review',
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
          readOnly: true,
          expectsFindings: true,
          implementationSessionId,
          stepId: 'review',
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
  agent: { provider: string; model: string };
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
  if (provider !== 'claude' && provider !== 'codex' && provider !== 'gemini') {
    throw new Error(`Provider ${provider} is not enabled for board execution`);
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
    readOnly: !params.writes,
    expectsFindings: params.verdict,
    implementationSessionId: params.implementationSessionId,
    stepId: params.stepId,
    runIndex: params.runIndex,
  });
  return sessionId;
}
