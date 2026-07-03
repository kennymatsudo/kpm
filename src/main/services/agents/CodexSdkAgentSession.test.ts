import { describe, expect, it, vi } from 'vitest';
import { CodexSdkAgentSession } from './CodexSdkAgentSession';

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(function Codex() {
    return { startThread: vi.fn() };
  }),
}));

vi.mock('../../codex/binary', () => ({
  findCodexBinaryPath: () => '/tmp/codex',
}));

interface SessionTestHarness {
  lastAssistantMessage: string;
}

function testHarness(session: CodexSdkAgentSession): SessionTestHarness {
  return session as unknown as SessionTestHarness;
}

function makeSession(role: 'implement' | 'review'): CodexSdkAgentSession {
  return new CodexSdkAgentSession({ id: 'test-codex-session', role });
}

describe('CodexSdkAgentSession.getResult', () => {
  it('returns only finalText for an implementation-role session', () => {
    const session = makeSession('implement');
    testHarness(session).lastAssistantMessage = 'Implemented the task.';

    expect(session.getResult()).toEqual({ finalText: 'Implemented the task.' });
  });

  it('parses valid findings JSON from a review-role session', () => {
    const session = makeSession('review');
    testHarness(session).lastAssistantMessage = '{"findings":[{"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}]}';

    expect(session.getResult()).toEqual({
      finalText: '{"findings":[{"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}]}',
      review: {
        findings: [
          {
            severity: 'warning',
            file: 'src/app.ts',
            line: 12,
            description: 'Handle null input.',
            agent: 'codex',
            source: 'agent',
          },
        ],
      },
      reviewRawOutput: '{"findings":[{"severity":"warning","file":"src/app.ts","line":12,"description":"Handle null input."}]}',
    });
  });

  it('classifies malformed review output as an error while keeping the raw text', () => {
    const session = makeSession('review');
    testHarness(session).lastAssistantMessage = 'All done. Looks good.';

    expect(session.getResult()).toEqual({
      finalText: 'All done. Looks good.',
      review: { error: 'Review agent returned output that did not match the required findings JSON schema' },
      reviewRawOutput: 'All done. Looks good.',
    });
  });

  it('classifies missing output as an error for a review-role session', () => {
    const session = makeSession('review');

    expect(session.getResult()).toEqual({
      finalText: null,
      review: { error: 'Review agent completed without findings output' },
      reviewRawOutput: null,
    });
  });
});
