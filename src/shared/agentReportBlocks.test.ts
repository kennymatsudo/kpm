import { describe, expect, it } from 'vitest';
import { parseCriteriaStatus, parseFindingReplies, stripAgentReportBlocks } from './agentReportBlocks';

const report = [
  'Fixed both findings.',
  '```finding-replies',
  '{"replies":[{"finding":1,"status":"fixed"},{"finding":2,"status":"declined","reason":"Out of scope."},{"finding":0,"status":"fixed"},{"finding":3,"status":"maybe"}]}',
  '```',
  '```criteria-status',
  '{"criteria":[{"criterion":1,"status":"met"},{"criterion":2,"status":"unverified","note":"Needs staging."}]}',
  '```',
].join('\n');

describe('agent report blocks', () => {
  it('reads finding replies and drops entries it cannot trust', () => {
    expect(parseFindingReplies(report)).toEqual([
      { finding: 1, disposition: 'fixed', reason: null },
      { finding: 2, disposition: 'declined', reason: 'Out of scope.' },
    ]);
  });

  it('reads criteria status', () => {
    expect(parseCriteriaStatus(report)).toEqual([
      { criterion: 1, state: 'met', note: null },
      { criterion: 2, state: 'unverified', note: 'Needs staging.' },
    ]);
  });

  it('uses the last block when the agent restates it', () => {
    const restated = '```criteria-status\n[{"criterion":1,"status":"unmet"}]\n```\nLater:\n```criteria-status\n[{"criterion":1,"status":"met"}]\n```';
    expect(parseCriteriaStatus(restated)).toEqual([{ criterion: 1, state: 'met', note: null }]);
  });

  it.each([
    { name: 'no block', text: 'Just prose.' },
    { name: 'malformed JSON', text: '```finding-replies\n{not json\n```' },
  ])('returns null for $name', ({ text }) => {
    expect(parseFindingReplies(text)).toBeNull();
  });

  it('removes the blocks from the report a person reads', () => {
    expect(stripAgentReportBlocks(report)).toBe('Fixed both findings.');
  });
});
