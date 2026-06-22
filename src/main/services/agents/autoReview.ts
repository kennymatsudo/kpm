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
import type { AgentType, ReviewFinding } from '../../../shared/agent-types';
import { toReviewSessionId } from '../../../shared/agent-types';
import { getReviewOpponent, isAgentAvailable } from './agentCatalog';
import { hasCodexAuth } from '../../codex/auth';
import type { AgentSessionManager } from './AgentSessionManager';

const LOG_PREFIX = '[AutoReview]';

export const REVIEW_FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'line', 'description'],
        properties: {
          severity: {
            type: 'string',
            enum: ['critical', 'warning', 'suggestion'],
          },
          file: { type: 'string' },
          line: {
            type: ['integer', 'null'],
          },
          description: { type: 'string' },
        },
      },
    },
  },
} as const;

// Static output format appended to every review prompt regardless of user customizations.
// parseReviewFindings() depends on this exact shape — do not make it user-editable.
const REVIEW_OUTPUT_FORMAT = `Return ONLY a JSON object with this shape:
- findings: an array of finding objects

Each finding should have:
- severity: "critical" | "warning" | "suggestion"
- file: the file path
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
    { "severity": "suggestion", "file": "src/utils.ts", "line": 5, "description": "Variable name 'd' is ambiguous in context. Renaming to 'durationMs' would improve readability." }
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
async function getWorktreeDiff(worktreePath: string, baseBranch?: string | null): Promise<string> {
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
      model: getConfig().generation.fastModel,
      cwd: worktreePath,
      maxTurns: 5,
      permissionMode: getConfig().claude.defaultPermissionMode,
      // One-shot review agent — disable the built-in option-picker tool.
      disallowedTools: ['AskUserQuestion'],
      skills: [],
      env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
      ...getClaudeSdkSpawnOptions(),
    };

    const session = agentSessionManager.create({
      devSessionId: reviewSessionId,
      projectId,
      agentType: 'claude',
      role: 'review',
      sdkOptions,
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
  });

  await session.start(worktreePath, prompt);
}

async function isReviewAgentAvailable(agentType: AgentType): Promise<boolean> {
  if (agentType === 'codex') {
    return hasCodexAuth();
  }
  return isAgentAvailable(agentType);
}

function extractJsonCandidate(output: string): string | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('```')) {
    const unfenced = trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    if (unfenced) {
      return unfenced;
    }
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return trimmed.startsWith('{') || trimmed.startsWith('[') ? trimmed : null;
}

/**
 * Parse review findings from agent output text.
 * Returns null when the output does not contain valid findings JSON.
 */
export function parseReviewFindings(output: string, reviewerAgent: AgentType): ReviewFinding[] | null {
  const cleaned = extractJsonCandidate(output);
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned);
    const findings = Array.isArray(parsed)
      ? parsed
      : (
        parsed
        && typeof parsed === 'object'
        && Array.isArray((parsed as { findings?: unknown }).findings)
          ? (parsed as { findings: unknown[] }).findings
          : null
      );
    if (!findings) return null;

    return findings
      .filter((f: Record<string, unknown>) => f && typeof f.description === 'string')
      .map((f: Record<string, unknown>) => ({
        severity: (['critical', 'warning', 'suggestion'].includes(f.severity as string)
          ? f.severity
          : 'suggestion') as ReviewFinding['severity'],
        file: typeof f.file === 'string' ? f.file : '',
        line: typeof f.line === 'number' ? f.line : undefined,
        description: String(f.description),
        agent: reviewerAgent,
        source: 'agent' as const,
      }));
  } catch {
    console.warn(`${LOG_PREFIX} Failed to parse review findings:`, cleaned.slice(0, 200));
    return null;
  }
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
