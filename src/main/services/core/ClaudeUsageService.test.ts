import { describe, expect, it } from 'vitest';
import { createClaudeUsageService } from './ClaudeUsageService';
import type { IClaudeUsageRepository, ClaudeUsageEventInsert } from '../../db/interfaces/usage';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { ClaudeUsageEvent } from '../../../shared/usage-types';

function createUsageRepo(): IClaudeUsageRepository & { events: ClaudeUsageEvent[] } {
  const events: ClaudeUsageEvent[] = [];
  return {
    events,
    insert(event: ClaudeUsageEventInsert): ClaudeUsageEvent {
      const row: ClaudeUsageEvent = {
        id: `event-${events.length + 1}`,
        project_id: event.project_id,
        source: event.source,
        model: event.model,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        cache_creation_tokens: event.cache_creation_tokens,
        cache_read_tokens: event.cache_read_tokens,
        cost_micro_usd: event.cost_micro_usd,
        sdk_session_id: event.sdk_session_id ?? null,
        sdk_result_uuid: event.sdk_result_uuid ?? null,
        sdk_cost_scope: event.sdk_cost_scope ?? null,
        sdk_cumulative_cost_micro_usd: event.sdk_cumulative_cost_micro_usd ?? null,
        cost_source: event.cost_source,
        ttft_ms: event.ttft_ms ?? null,
        duration_ms: event.duration_ms ?? null,
        step_id: event.step_id ?? null,
        run_index: event.run_index ?? null,
        dev_session_id: event.dev_session_id ?? null,
        created_at: new Date(events.length).toISOString(),
      };
      events.push(row);
      return row;
    },
    getLastSdkCumulativeCostMicroUsd(sdkSessionId: string, sdkCostScope: string): number | null {
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        if (event.sdk_session_id === sdkSessionId && event.sdk_cost_scope === sdkCostScope) {
          return event.sdk_cumulative_cost_micro_usd ?? null;
        }
      }
      return null;
    },
    totalsByProject: () => ({ events: 0, input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, cost_micro_usd: 0 }),
    breakdownByProject: () => [],
    breakdownAll: () => [],
    breakdownByProjectAll: () => [],
    globalTotals: () => ({ events: 0, input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, cost_micro_usd: 0 }),
    listRecent: () => [],
    listBoardPlaybookCostsByDevSession: () => [],
    deleteByProject: () => {},
  };
}

function createProjectRepo(): IProjectRepository {
  return {
    get: () => undefined,
    updateTokens: () => {},
  } as unknown as IProjectRepository;
}

describe('ClaudeUsageService', () => {
  it('stores SDK cumulative snapshots as additive deltas per session and scope', () => {
    const usageRepo = createUsageRepo();
    const service = createClaudeUsageService({
      claudeUsage: usageRepo,
      projects: createProjectRepo(),
      getMainWindow: () => null,
    });

    service.recordUsage({
      projectId: 'project-1',
      source: 'chat',
      model: 'opus',
      usage: { input_tokens: 10, output_tokens: 1 },
      totalCostUsd: 1.25,
      sdkSessionId: 'session-1',
      sdkResultUuid: 'result-1',
      sdkCostScope: 'opus',
      isCumulativeCostSnapshot: true,
    });

    service.recordUsage({
      projectId: 'project-1',
      source: 'chat',
      model: 'opus',
      usage: { input_tokens: 12, output_tokens: 2 },
      totalCostUsd: 2.00,
      sdkSessionId: 'session-1',
      sdkResultUuid: 'result-2',
      sdkCostScope: 'opus',
      isCumulativeCostSnapshot: true,
    });

    expect(usageRepo.events.map((event) => event.cost_micro_usd)).toEqual([1_250_000, 750_000]);
    expect(usageRepo.events.map((event) => event.sdk_cumulative_cost_micro_usd)).toEqual([1_250_000, 2_000_000]);
    expect(usageRepo.events.every((event) => event.cost_source === 'sdk_cumulative_delta')).toBe(true);
  });

  it('groups persisted playbook costs by step for one dev session, including fan-out runs', () => {
    const usageRepo = createUsageRepo();
    const rows = [
      { step_id: 'review', cost_micro_usd: 1200 },
      { step_id: 'review', cost_micro_usd: 800 },
      { step_id: 'implement', cost_micro_usd: 5000 },
    ];
    (usageRepo as unknown as { listBoardPlaybookCostsByDevSession: (id: string) => typeof rows }).listBoardPlaybookCostsByDevSession = (id) => id === 'dev-1' ? rows : [];
    const service = createClaudeUsageService({
      claudeUsage: usageRepo,
      projects: createProjectRepo(),
      getMainWindow: () => null,
    });

    expect(service.getBoardPlaybookStepCosts('dev-1')).toEqual({ implement: 5000, review: 2000 });
  });

  it('uses corrected Opus pricing for local fallback', () => {
    const usageRepo = createUsageRepo();
    const service = createClaudeUsageService({
      claudeUsage: usageRepo,
      projects: createProjectRepo(),
      getMainWindow: () => null,
    });

    service.recordUsage({
      projectId: null,
      source: 'custom_prompt',
      model: 'claude-opus-4-8',
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      },
    });

    expect(usageRepo.events[0].cost_micro_usd).toBe(36_750_000);
    expect(usageRepo.events[0].cost_source).toBe('local_pricing_fallback');
  });

  it('passes ttftMs/durationMs through to the inserted event, defaulting to null when omitted', () => {
    const usageRepo = createUsageRepo();
    const service = createClaudeUsageService({
      claudeUsage: usageRepo,
      projects: createProjectRepo(),
      getMainWindow: () => null,
    });

    service.recordUsage({
      projectId: 'project-1',
      source: 'chat',
      model: 'sonnet',
      usage: { input_tokens: 5, output_tokens: 5 },
      ttftMs: 1800,
      durationMs: 14200,
    });

    service.recordUsage({
      projectId: 'project-1',
      source: 'briefing',
      model: 'sonnet',
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    expect(usageRepo.events[0].ttft_ms).toBe(1800);
    expect(usageRepo.events[0].duration_ms).toBe(14200);
    expect(usageRepo.events[1].ttft_ms).toBeNull();
    expect(usageRepo.events[1].duration_ms).toBeNull();
  });
});
