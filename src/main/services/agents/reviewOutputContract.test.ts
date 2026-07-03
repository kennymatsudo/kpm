import { describe, expect, it } from 'vitest';
import { deriveReviewOutcome, parseReviewFindings } from './reviewOutputContract';

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

describe('deriveReviewOutcome', () => {
  it('returns findings and raw output on a valid review', () => {
    const outcome = deriveReviewOutcome('{"findings":[]}', 'claude');
    expect(outcome).toEqual({ findings: [], rawOutput: '{"findings":[]}' });
  });

  it('flags missing output as an error without pretending there were no findings', () => {
    expect(deriveReviewOutcome(null, 'claude')).toEqual({
      rawOutput: null,
      error: 'Review agent completed without findings output',
    });
    expect(deriveReviewOutcome('   ', 'claude')).toEqual({
      rawOutput: '   ',
      error: 'Review agent completed without findings output',
    });
  });

  it('flags malformed output as an error while preserving the raw text', () => {
    expect(deriveReviewOutcome('All done. Looks good.', 'codex')).toEqual({
      rawOutput: 'All done. Looks good.',
      error: 'Review agent returned output that did not match the required findings JSON schema',
    });
  });
});
