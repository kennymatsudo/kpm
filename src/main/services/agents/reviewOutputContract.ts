/**
 * Review Output Contract
 *
 * The JSON schema opposing-agent review sessions are asked to return, and the
 * parser that turns that raw text into `ReviewFinding[]`. Every adapter's
 * review-role output funnels through `deriveReviewOutcome` so "what counts as
 * a valid review result" lives in one place instead of being re-derived by
 * each adapter or by the session manager.
 */

import type { AgentType, ReviewFinding } from '../../../shared/agent-types';

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
    console.warn('[ReviewOutputContract] Failed to parse review findings:', cleaned.slice(0, 200));
    return null;
  }
}

export interface ReviewOutcome {
  findings?: ReviewFinding[];
  rawOutput: string | null;
  error?: string;
}

/**
 * Turn a review session's final text into a `ReviewOutcome` — the shared
 * success/failure contract every adapter's review role produces. Adapters
 * that already receive structured JSON (e.g. Codex via `outputSchema`) still
 * route through this so "missing output" and "output that doesn't match the
 * schema" are classified identically everywhere.
 */
export function deriveReviewOutcome(finalText: string | null, reviewerAgent: AgentType): ReviewOutcome {
  if (!finalText?.trim()) {
    return {
      rawOutput: finalText,
      error: 'Review agent completed without findings output',
    };
  }

  const findings = parseReviewFindings(finalText, reviewerAgent);
  if (!findings) {
    return {
      rawOutput: finalText,
      error: 'Review agent returned output that did not match the required findings JSON schema',
    };
  }

  return { findings, rawOutput: finalText };
}
