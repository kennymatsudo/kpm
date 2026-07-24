/**
 * ClaudeUsageService
 *
 * Centralized recording of Claude API usage across every place KPM invokes
 * the Claude Agent SDK (main chat, board agents, PR description, commit message,
 * review assessment, custom prompt generation, and onboarding).
 * Codex/Gemini sessions are tracked separately and do NOT
 * flow through this service.
 *
 * Each call to recordUsage:
 *   1. Persists an event row in `claude_usage_events` (append-only).
 *   2. Rolls the totals up onto the existing `projects.session_*_tokens`
 *      columns so the project header keeps showing live token counts.
 *   3. Broadcasts a `usage:event` payload so a renderer dashboard can react.
 *
 * Callers pass in the `usage` block from the SDK's `result` message; we
 * tolerate missing fields (cache_creation/cache_read are optional in older
 * SDK versions) and silently no-op when total tokens are zero.
 */

import type { BrowserWindow } from 'electron';
import type {
  IClaudeUsageRepository,
  ClaudeUsageEvent,
  ClaudeUsageTotals,
  ClaudeUsageBreakdownRow,
  ClaudeUsageProjectBreakdownRow,
} from '../../db/interfaces/usage';
import type { IProjectRepository } from '../../db/interfaces/project';
import { computeCostMicroUsd, resolveModelPricing } from '../../config/claudePricing';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { usageEvents } from '../../../shared/ipc/usageEvents';

// =============================================================================
// Types
// =============================================================================

/**
 * Where the usage came from. Add new sources sparingly — the dashboard groups
 * by this value, so a stable taxonomy is more useful than fine-grained labels.
 */
export type UsageSource =
  | 'chat'
  | 'board_playbook'
  | 'onboarding'
  | 'pr_description'
  | 'commit_message'
  | 'review_assessment'
  | 'review_assessment_post_impl'
  | 'custom_prompt'
  | 'file-summary';

/** Shape of the SDK's `result.usage` block (with the fields we care about). */
export interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface RecordUsageInput {
  /** Project this usage is attributable to, or null for cross-project work. */
  projectId: string | null;
  source: UsageSource;
  model: string | null | undefined;
  usage: RawUsage | null | undefined;
  /**
   * SDK-reported cost in USD when available. For one-shot queries this is the
   * query total; for persistent Agent SDK sessions it is a cumulative snapshot
   * and must be converted to a delta before storing in the summable ledger.
   */
  totalCostUsd?: number | null;
  /** SDK session/result identifiers used for delta calculation and deduping. */
  sdkSessionId?: string | null;
  sdkResultUuid?: string | null;
  /** Scope of the cumulative cost stream, usually a modelUsage key or '__total__'. */
  sdkCostScope?: string | null;
  /** True when totalCostUsd is cumulative for sdkSessionId/sdkCostScope. */
  isCumulativeCostSnapshot?: boolean;
  ttftMs?: number | null;
  durationMs?: number | null;
  stepId?: string | null;
  runIndex?: number | null;
  devSessionId?: string | null;
}

export interface ProjectUsageStats {
  projectId: string | null;
  totals: ClaudeUsageTotals;
  breakdown: ClaudeUsageBreakdownRow[];
  byProject?: ClaudeUsageProjectBreakdownRow[];
}

export interface ClaudeUsageServiceDeps {
  claudeUsage: IClaudeUsageRepository;
  projects: IProjectRepository;
  getMainWindow: () => BrowserWindow | null;
}

// =============================================================================
// Service Factory
// =============================================================================

export function createClaudeUsageService(deps: ClaudeUsageServiceDeps) {
  const log = (msg: string) => console.log(`[ClaudeUsageService] ${msg}`);
  const logError = (msg: string) => console.error(`[ClaudeUsageService] ${msg}`);

  function normalizeUsage(usage: RawUsage | null | undefined) {
    return {
      input: Math.max(0, Math.round(usage?.input_tokens ?? 0)),
      output: Math.max(0, Math.round(usage?.output_tokens ?? 0)),
      cacheCreation: Math.max(0, Math.round(usage?.cache_creation_input_tokens ?? 0)),
      cacheRead: Math.max(0, Math.round(usage?.cache_read_input_tokens ?? 0)),
    };
  }

  function computeStoredCost(input: RecordUsageInput, tokens: ReturnType<typeof normalizeUsage>) {
    if (typeof input.totalCostUsd === 'number' && Number.isFinite(input.totalCostUsd)) {
      const cumulativeCostMicroUsd = Math.max(0, Math.round(input.totalCostUsd * 1_000_000));

      const sdkCostScope = input.sdkCostScope ?? '__total__';
      if (input.isCumulativeCostSnapshot && input.sdkSessionId) {
        const previous = deps.claudeUsage.getLastSdkCumulativeCostMicroUsd(input.sdkSessionId, sdkCostScope);
        const delta = previous === null || cumulativeCostMicroUsd < previous
          ? cumulativeCostMicroUsd
          : cumulativeCostMicroUsd - previous;

        return {
          costMicroUsd: Math.max(0, delta),
          sdkCumulativeCostMicroUsd: cumulativeCostMicroUsd,
          costSource: 'sdk_cumulative_delta',
        };
      }

      return {
        costMicroUsd: cumulativeCostMicroUsd,
        sdkCumulativeCostMicroUsd: cumulativeCostMicroUsd,
        costSource: 'sdk_total',
      };
    }

    return {
      costMicroUsd: computeCostMicroUsd(input.model, {
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        cacheCreationTokens: tokens.cacheCreation,
        cacheReadTokens: tokens.cacheRead,
      }),
      sdkCumulativeCostMicroUsd: null,
      costSource: 'local_pricing_fallback',
    };
  }

  function recordUsage(input: RecordUsageInput): ClaudeUsageEvent | null {
    try {
      const tokens = normalizeUsage(input.usage);
      const total = tokens.input + tokens.output + tokens.cacheCreation + tokens.cacheRead;

      // Skip empty rows. Some SDK messages emit a result with no usage fields
      // (e.g. early aborts); recording zero-token events would just clutter
      // the dashboard.
      if (total === 0) {
        return null;
      }

      const { tier } = resolveModelPricing(input.model);
      // Prefer SDK cost when present. For persistent sessions the SDK emits
      // cumulative snapshots, so convert to an additive delta before storing.
      // The local pricing table is only a fallback for calls without SDK cost.
      const { costMicroUsd, sdkCumulativeCostMicroUsd, costSource } = computeStoredCost(input, tokens);

      // Capture the project name at insert time so the by-project breakdown
      // can show a meaningful label even after the project is deleted. While
      // the project still exists, queries prefer the live `projects.name` so
      // renames flow through to historical events.
      const projectNameSnapshot = input.projectId
        ? (deps.projects.get(input.projectId)?.name ?? null)
        : null;

      const event = deps.claudeUsage.insert({
        project_id: input.projectId,
        project_name_snapshot: projectNameSnapshot,
        source: input.source,
        // Persist the resolved tier (opus/sonnet/haiku) when the caller passed
        // an alias; otherwise persist the raw model string. Either way the
        // dashboard can group by it.
        model: input.model && input.model.length > 0 ? input.model : tier,
        input_tokens: tokens.input,
        output_tokens: tokens.output,
        cache_creation_tokens: tokens.cacheCreation,
        cache_read_tokens: tokens.cacheRead,
        cost_micro_usd: costMicroUsd,
        sdk_session_id: input.sdkSessionId ?? null,
        sdk_result_uuid: input.sdkResultUuid ?? null,
        sdk_cost_scope: input.sdkCostScope ?? (input.isCumulativeCostSnapshot ? '__total__' : null),
        sdk_cumulative_cost_micro_usd: sdkCumulativeCostMicroUsd,
        cost_source: costSource,
        ttft_ms: input.ttftMs ?? null,
        duration_ms: input.durationMs ?? null,
        step_id: input.stepId ?? null,
        run_index: input.runIndex ?? null,
        dev_session_id: input.devSessionId ?? null,
      });

      // Roll up to the existing project token columns so legacy UI surfaces
      // (e.g. project header token count) keep working without refactor.
      // Cache reads/writes count toward "input" for that legacy display.
      if (input.projectId) {
        try {
          const inputForRollup = tokens.input + tokens.cacheCreation + tokens.cacheRead;
          deps.projects.updateTokens(input.projectId, {
            input: inputForRollup,
            output: tokens.output,
            total: inputForRollup + tokens.output,
          });
        } catch (err) {
          logError(`Failed to roll up tokens to project ${input.projectId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const window = deps.getMainWindow();
      if (window && !window.isDestroyed()) {
        emitAppEvent(window.webContents, usageEvents.event, {
          projectId: input.projectId,
          source: input.source,
          model: event.model,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheCreationTokens: tokens.cacheCreation,
          cacheReadTokens: tokens.cacheRead,
          costMicroUsd: costMicroUsd,
        });
      }

      return event;
    } catch (err) {
      // Usage tracking is non-critical — never let a failure here break a
      // Claude call. Log and move on.
      logError(`recordUsage failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  function getProjectStats(projectId: string): ProjectUsageStats {
    return {
      projectId,
      totals: deps.claudeUsage.totalsByProject(projectId),
      breakdown: deps.claudeUsage.breakdownByProject(projectId),
      byProject: deps.claudeUsage.breakdownByProjectAll(),
    };
  }

  function getGlobalStats(): ProjectUsageStats {
    return {
      projectId: null,
      totals: deps.claudeUsage.globalTotals(),
      breakdown: deps.claudeUsage.breakdownAll(),
      byProject: deps.claudeUsage.breakdownByProjectAll(),
    };
  }

  function listRecentEvents(projectId: string | null, limit = 100): ClaudeUsageEvent[] {
    return deps.claudeUsage.listRecent(projectId, limit);
  }

  function getBoardPlaybookStepCosts(devSessionId: string): Record<string, number> {
    const costs: Record<string, number> = {};
    for (const row of deps.claudeUsage.listBoardPlaybookCostsByDevSession(devSessionId)) {
      costs[row.step_id] = (costs[row.step_id] ?? 0) + row.cost_micro_usd;
    }
    return costs;
  }

  function resetProject(projectId: string): void {
    deps.claudeUsage.deleteByProject(projectId);
    deps.projects.resetTokens(projectId);
    log(`Reset usage events and token counts for project ${projectId}`);
  }

  return {
    recordUsage,
    getProjectStats,
    getGlobalStats,
    listRecentEvents,
    getBoardPlaybookStepCosts,
    resetProject,
  };
}

export type ClaudeUsageService = ReturnType<typeof createClaudeUsageService>;
