import { describe, expect, it } from 'vitest';
import { CliAgentSession } from './CliAgentSession';
import type { AgentCompletionSummary } from '../../../shared/agent-types';

interface SessionTestHarness {
  handleCompletion(): Promise<void>;
  getCompletionSummary: () => Promise<AgentCompletionSummary>;
  setState(state: string): void;
}

function testHarness(session: CliAgentSession): SessionTestHarness {
  return session as unknown as SessionTestHarness;
}

function makeSession(): CliAgentSession {
  return new CliAgentSession({
    id: 'test-cli-session',
    agentType: 'claude',
    role: 'implement',
    hookPort: 0,
  });
}

describe('CliAgentSession completion race', () => {
  it('does not double-fire onComplete when handleCompletion is invoked twice concurrently', async () => {
    // Regression test: CliAgentSession previously had no completion
    // re-entrancy guard, so a PTY exit and a hook "stop" event racing before
    // either observed the state change could both slip through and fire
    // onComplete twice. BaseAgentSession.completeOnce now closes that gap.
    const session = makeSession();
    testHarness(session).setState('working');

    let callCount = 0;
    testHarness(session).getCompletionSummary = async () => {
      callCount += 1;
      return { filesChanged: 3, additions: 5, deletions: 2 };
    };

    const completions: AgentCompletionSummary[] = [];
    session.on('onComplete', (summary) => completions.push(summary));

    // Both calls start synchronously, before either has observed a state
    // change — the same window a PTY exit and a hook "stop" event could race in.
    await Promise.all([
      testHarness(session).handleCompletion(),
      testHarness(session).handleCompletion(),
    ]);

    expect(callCount).toBe(1);
    expect(completions).toHaveLength(1);
    expect(session.state).toBe('complete');
  });
});
