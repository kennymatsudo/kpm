import { describe, expect, it } from 'vitest';
import { parseReviewFindings } from './autoReview';

describe('parseReviewFindings', () => {
  it('parses fenced JSON output', () => {
    expect(parseReviewFindings('```json\n[]\n```', 'claude')).toEqual([]);
  });

  it('parses wrapped findings objects for Codex schema output', () => {
    expect(
      parseReviewFindings(
        '{"findings":[{"severity":"warning","file":"src/app.ts","line":null,"description":"Handle null input."}]}',
        'codex'
      )
    ).toEqual([
      {
        severity: 'warning',
        file: 'src/app.ts',
        line: undefined,
        description: 'Handle null input.',
        agent: 'codex',
        source: 'agent',
      },
    ]);
  });

  it('extracts findings from mixed CLI output', () => {
    const output = [
      'Review complete.',
      '{"findings":[',
      '  {"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}',
      ']}',
    ].join('\n');

    expect(parseReviewFindings(output, 'codex')).toEqual([
      {
        severity: 'warning',
        file: 'src/app.ts',
        line: 12,
        description: 'Handle null input.',
        agent: 'codex',
        source: 'agent',
      },
    ]);
  });

  it('returns null for invalid output instead of pretending there were no findings', () => {
    expect(parseReviewFindings('not valid json', 'claude')).toBeNull();
  });
});
