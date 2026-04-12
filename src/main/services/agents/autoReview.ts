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
import type { AgentType, ReviewFinding } from '../../../shared/agent-types';
import { toReviewSessionId } from '../../../shared/agent-types';
import { getReviewOpponent, isAgentAvailable } from './agentCatalog';
import type { AgentSessionManager } from './AgentSessionManager';

const LOG_PREFIX = '[AutoReview]';

/**
 */
${taskDescription}

## Changes (git diff)
\`\`\`diff
${diff}
\`\`\`

}

/**
 * Get the diff for a worktree against the base branch.
 * Falls back to `git diff HEAD` (uncommitted only) when no base branch is provided.
 */
async function getWorktreeDiff(worktreePath: string, baseBranch?: string | null): Promise<string> {
  const maxBuffer = 5 * 1024 * 1024; // 5MB
  try {
    if (baseBranch) {
    }
    // Fall back to uncommitted-only diff when no base branch or branch diff is empty
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
  agentSessionManager: AgentSessionManager;
}): Promise<void> {
  const {
    reviewAgentType,
    reviewSessionId,
    projectId,
    worktreePath,
    reviewPrompt,
    agentSessionManager,
  } = params;

  if (reviewAgentType === 'claude') {
    const sdkOptions: SDKOptions = {
      cwd: worktreePath,
      maxTurns: 5,
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
  });

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
}): Promise<string | null> {
  const {
    implementationSessionId,
    implementationAgentType,
    worktreePath,
    baseBranch,
    taskDescription,
    projectId,
    agentSessionManager,
  } = params;

  // Determine the review agent
  let reviewAgentType = getReviewOpponent(implementationAgentType);

  // Check if the review agent is available; fall back to claude
      console.log(`${LOG_PREFIX} ${reviewAgentType} not available, falling back to claude for review`);
      reviewAgentType = 'claude';
    } else {
      console.log(`${LOG_PREFIX} No review agent available, skipping auto-review`);
      return null;
    }
  }

  // Get the diff
  const diff = await getWorktreeDiff(worktreePath, baseBranch);
  if (!diff.trim()) {
    console.log(`${LOG_PREFIX} No changes to review for session ${implementationSessionId}`);
    return null;
  }


  // Create a review session ID (derived from implementation session)
  const reviewSessionId = toReviewSessionId(implementationSessionId);

  try {
    await startReviewSession({
      reviewAgentType,
      reviewSessionId,
      projectId,
      worktreePath,
      reviewPrompt,
      agentSessionManager,
    });

    console.log(`${LOG_PREFIX} Started ${reviewAgentType} review for session ${implementationSessionId}`);
    return reviewSessionId;
  } catch (error) {
      try {
        console.warn(`${LOG_PREFIX} ${reviewAgentType} review failed to start, falling back to claude`, error);
        await startReviewSession({
          reviewAgentType: 'claude',
          reviewSessionId,
          projectId,
          worktreePath,
          reviewPrompt,
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
