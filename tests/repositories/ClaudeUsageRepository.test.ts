import { describe, it, expect, beforeEach } from 'vitest';
import { createTestRepositoryContext, type TestRepositoryContext } from '../';
import type { ClaudeUsageEventInsert } from '../../src/main/db/interfaces/usage';

function usageEvent(overrides: Partial<ClaudeUsageEventInsert>): ClaudeUsageEventInsert {
  return {
    project_id: null,
    project_name_snapshot: null,
    source: 'board_playbook',
    model: 'opus',
    input_tokens: 10,
    output_tokens: 10,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cost_micro_usd: 500,
    cost_source: 'sdk_total',
    dev_session_id: 'dev-1',
    step_id: 'implement',
    ...overrides,
  };
}

describe('ClaudeUsageRepository', () => {
  let ctx: TestRepositoryContext;

  beforeEach(() => {
    ctx = createTestRepositoryContext();
  });

  it('counts unpriced events so totals can say their cost is incomplete', () => {
    ctx.repos.claudeUsage.insert(usageEvent({}));
    ctx.repos.claudeUsage.insert(usageEvent({ model: 'gpt-5.5', cost_micro_usd: 0, cost_source: 'unknown' }));

    const totals = ctx.repos.claudeUsage.globalTotals();
    const byModel = Object.fromEntries(ctx.repos.claudeUsage.breakdownAll().map((row) => [row.model, row]));

    expect(totals).toMatchObject({ events: 2, unpriced_events: 1, cost_micro_usd: 500 });
    expect(byModel['gpt-5.5']).toMatchObject({ events: 1, unpriced_events: 1 });
    expect(byModel.opus).toMatchObject({ events: 1, unpriced_events: 0 });
  });

  it('leaves unpriced runs out of playbook step costs rather than showing them as free', () => {
    ctx.repos.claudeUsage.insert(usageEvent({}));
    ctx.repos.claudeUsage.insert(usageEvent({ step_id: 'review', cost_micro_usd: 0, cost_source: 'unknown' }));

    expect(ctx.repos.claudeUsage.listBoardPlaybookCostsByDevSession('dev-1')).toEqual([
      { step_id: 'implement', cost_micro_usd: 500 },
    ]);
  });
});
