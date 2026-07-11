import { describe, expect, it } from 'vitest';
import { deriveReviewOutcome, parseReviewFindings, REVIEW_FINDINGS_SCHEMA } from './reviewOutputContract';

describe('REVIEW_FINDINGS_SCHEMA', () => {
  // Codex forwards this schema to the OpenAI Responses API in strict mode,
  // which rejects any object whose `required` omits a `properties` key.
  it('lists every property key in required on every object', () => {
    interface SchemaNode {
      type?: unknown;
      properties?: Record<string, SchemaNode>;
      required?: unknown;
      items?: SchemaNode;
    }
    const assertStrict = (schema: SchemaNode): void => {
      if (schema.type === 'object' && schema.properties) {
        expect(schema.required).toEqual(Object.keys(schema.properties));
        Object.values(schema.properties).forEach(assertStrict);
      }
      if (schema.type === 'array' && schema.items) {
        assertStrict(schema.items);
      }
    };
    assertStrict(REVIEW_FINDINGS_SCHEMA);
  });
});

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

  it('parses findings without file or line when the issue has no source location', () => {
    expect(
      parseReviewFindings(
        '{"findings":[{"severity":"critical","description":"The integration test failed before a file-specific assertion ran."}]}',
        'claude'
      )
    ).toEqual([
      {
        severity: 'critical',
        file: undefined,
        line: undefined,
        description: 'The integration test failed before a file-specific assertion ran.',
        agent: 'claude',
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
