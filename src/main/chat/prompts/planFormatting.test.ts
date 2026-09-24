import { describe, expect, it } from 'vitest';
import { buildCurrentPlanSection } from './planFormatting';
import { makePlanItem } from './__fixtures__/promptContextFixtures';

const OPEN_ID = '11111111-1111-4111-8111-111111111111';
const DONE_ID = '22222222-2222-4222-8222-222222222222';
const DONE_PARENT_ID = '33333333-3333-4333-8333-333333333333';
const OPEN_CHILD_ID = '44444444-4444-4444-8444-444444444444';

describe('buildCurrentPlanSection', () => {
  it('leaves closed items out of the listing and says how to find them', () => {
    const section = buildCurrentPlanSection([
      makePlanItem(OPEN_ID, { status_category: 'in_progress' }),
      makePlanItem(DONE_ID, { status_category: 'done' }),
    ]);

    expect(section).toContain(OPEN_ID);
    expect(section).not.toContain(DONE_ID);
    expect(section).toContain('2 items. 1 closed (done or canceled) item is not listed; find them with `query_plan_items`.');
  });

  it('treats canceled items as closed', () => {
    const section = buildCurrentPlanSection([
      makePlanItem(OPEN_ID, { status_category: 'in_progress' }),
      makePlanItem(DONE_ID, { status_category: 'canceled' }),
    ]);

    expect(section).not.toContain(DONE_ID);
  });

  it('keeps a closed parent that still has an open child', () => {
    const section = buildCurrentPlanSection([
      makePlanItem(DONE_PARENT_ID, { status_category: 'done' }),
      makePlanItem(OPEN_CHILD_ID, { status_category: 'in_progress', parent_id: DONE_PARENT_ID }),
    ]);

    expect(section).toContain(`- \`${DONE_PARENT_ID}\``);
    expect(section).toContain(`  - \`${OPEN_CHILD_ID}\``);
    expect(section).not.toContain('not listed');
  });

  it('reports a plan where everything is closed', () => {
    const section = buildCurrentPlanSection([makePlanItem(DONE_ID, { status_category: 'done' })]);

    expect(section).toBe('# Current Plan\n1 item, closed (done or canceled), so none are listed; find them with `query_plan_items`.');
  });
});
