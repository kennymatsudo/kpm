import { describe, expect, it } from 'vitest';
import type { AgentActivity } from '../../../shared/agent-types';
import { appendActivity, createActivityFeed, presentActivities } from './activityPresentation';

const activity = (overrides: Partial<AgentActivity>): AgentActivity => ({
  type: 'tool_use', timestamp: 1, summary: 'Run command', kind: 'run', ...overrides,
});

describe('presentActivities', () => {
  it('collapses consecutive polling commands and preserves their result', () => {
    const groups = presentActivities([
      activity({ toolName: 'exec_command', toolInput: 'sleep 20; echo TEST=$(cat /tmp/test.exit)' }),
      activity({ type: 'tool_result', toolName: 'exec_command', summary: 'Run completed', status: 'success' }),
      activity({ timestamp: 2, toolName: 'exec_command', toolInput: 'sleep 20; echo TEST=$(cat /tmp/test.exit)' }),
      activity({ type: 'tool_result', timestamp: 3, toolName: 'exec_command', summary: 'Run completed', status: 'success' }),
    ]);

    expect(groups[0].entries).toEqual([
      expect.objectContaining({ kind: 'collapsed', label: 'Waiting for test results', result: expect.objectContaining({ status: 'success' }) }),
    ]);
    expect(groups[0].entries[0]).toMatchObject({ activities: [expect.anything(), expect.anything()] });
  });

  it('uses intent labels for verification commands', () => {
    const groups = presentActivities([
      activity({ toolName: 'exec_command', toolInput: 'git diff --check && npm test' }),
    ]);

    expect(groups[0].entries[0]).toMatchObject({ kind: 'activity', label: 'Running tests' });
  });

  it('drops the worktree cd prefix from command labels and still hides exploration behind it', () => {
    const groups = presentActivities([
      activity({ toolName: 'exec_command', summary: 'Run cd /repo/.kpm-worktrees/task && rg creator_id src', toolInput: 'cd /repo/.kpm-worktrees/task && rg creator_id src' }),
      activity({ timestamp: 2, toolName: 'exec_command', summary: 'Run cd "/repo/with space" && cat a.ts', toolInput: 'cd "/repo/with space" && cat a.ts' }),
    ]);

    expect(groups[0].entries).toEqual([expect.objectContaining({ label: 'Run rg creator_id src' })]);
  });

  it('keeps errors while omitting exploratory reads', () => {
    const groups = presentActivities([
      activity({ kind: 'read', toolName: 'read', summary: 'Read src/file.ts' }),
      activity({ type: 'error', summary: 'Tests failed' }),
    ]);

    expect(groups[0].entries).toEqual([
      expect.objectContaining({ kind: 'activity', label: 'Tests failed' }),
    ]);
  });

  describe('kind-based classification', () => {
    it('hides a read-kind tool call regardless of provider tool name', () => {
      const groups = presentActivities([
        activity({ kind: 'read', toolName: 'mcp__kpm__read_file', toolInput: 'src/app.ts' }),
      ]);

      expect(groups).toEqual([]);
    });

    it('filters trivial shell exploration for any provider whose tool maps to kind "run"', () => {
      const codexLs = presentActivities([activity({ kind: 'run', toolName: 'exec_command', toolInput: 'ls -la' })]);
      const claudeLs = presentActivities([activity({ kind: 'run', toolName: 'Bash', toolInput: 'ls -la' })]);

      expect(codexLs).toEqual([]);
      expect(claudeLs).toEqual([]);
    });

    it('picks an icon and Passed/Failed status off kind, not off the raw tool name', () => {
      const groups = presentActivities([
        activity({ kind: 'edit', toolName: 'apply_patch', toolInput: 'src/app.ts' }),
      ]);

      expect(groups[0].entries[0]).toMatchObject({ icon: 'edit' });
    });

    it('does not badge a non-run tool whose input text happens to contain a verification keyword', () => {
      const groups = presentActivities([
        activity({ kind: 'edit', toolName: 'Edit', toolInput: 'src/run_tests.py', status: 'success' }),
      ]);

      expect(groups[0].entries[0]).toMatchObject({ status: null });
    });
  });

  describe('call-id pairing', () => {
    it('pairs a tool_result to its tool_use by callId even when two identically-named calls are in flight', () => {
      const groups = presentActivities([
        activity({ toolName: 'Bash', toolInput: 'npm test -- a', callId: 'call-1' }),
        activity({ toolName: 'Bash', toolInput: 'npm test -- b', callId: 'call-2' }),
        activity({ type: 'tool_result', toolName: 'Bash', callId: 'call-2', status: 'failed' }),
        activity({ type: 'tool_result', toolName: 'Bash', callId: 'call-1', status: 'success' }),
      ]);

      const [first, second] = groups[0].entries;
      expect(first).toMatchObject({ label: 'Running tests', status: 'Passed' });
      expect(second).toMatchObject({ label: 'Running tests', status: 'Failed' });
    });

    it('falls back to FIFO-by-tool-name pairing for legacy activities with no callId', () => {
      const groups = presentActivities([
        activity({ toolName: 'Bash', toolInput: 'npm test -- a' }),
        activity({ toolName: 'Bash', toolInput: 'npm test -- b' }),
        activity({ type: 'tool_result', toolName: 'Bash', status: 'success' }),
        activity({ type: 'tool_result', toolName: 'Bash', status: 'failed' }),
      ]);

      const [first, second] = groups[0].entries;
      expect(first).toMatchObject({ status: 'Passed' });
      expect(second).toMatchObject({ status: 'Failed' });
    });
  });
});

describe('activity feed', () => {
  const run = (overrides: Partial<AgentActivity> = {}) =>
    activity({ toolName: 'Bash', toolInput: 'npm test', callId: 'call-1', ...overrides });

  const feedOf = (activities: AgentActivity[]) =>
    activities.reduce((feed, next) => appendActivity(feed, next), createActivityFeed());

  it('appending one at a time matches grouping the whole history at once', () => {
    const activities = [
      activity({ type: 'message', summary: 'Reading the code' }),
      run({ callId: 'a', toolInput: 'ls -la' }),
      run({ type: 'tool_result', callId: 'a', status: 'success' }),
      run({ callId: 'b', toolInput: 'npm test' }),
      run({ type: 'tool_result', callId: 'b', status: 'failed' }),
      activity({ type: 'message', summary: 'Fixing the failure' }),
      activity({ kind: 'edit', toolName: 'Edit', summary: 'Edit src/a.ts', callId: 'c' }),
      run({ callId: 'd', toolInput: 'sleep 20; npm test' }),
      run({ type: 'tool_result', callId: 'd', status: 'success' }),
      run({ callId: 'e', toolInput: 'sleep 20; npm test' }),
      run({ type: 'tool_result', callId: 'e', status: 'success' }),
      activity({ type: 'error', summary: 'Agent stopped', kind: undefined }),
    ];

    expect(feedOf(activities).groups).toEqual(presentActivities(activities));
  });

  it('leaves untouched groups referentially identical when a later group grows', () => {
    const feed = feedOf([
      activity({ type: 'message', summary: 'First' }),
      run({ callId: 'a', toolInput: 'npm test' }),
      activity({ type: 'message', summary: 'Second' }),
    ]);
    const firstGroup = feed.groups[0];

    const next = appendActivity(feed, run({ callId: 'b', toolInput: 'npm run lint' }));

    expect(next.groups[0]).toBe(firstGroup);
    expect(next.groups[1]).not.toBe(feed.groups[1]);
  });

  it('bounds retained activities and keeps the most recent', () => {
    let feed = createActivityFeed();
    for (let i = 0; i < 1500; i++) {
      feed = appendActivity(feed, activity({ type: 'message', summary: `step ${i}`, timestamp: i }));
    }

    expect(feed.count).toBeLessThanOrEqual(1200);
    expect(feed.latest?.summary).toBe('step 1499');
    expect(feed.toArray().at(-1)?.summary).toBe('step 1499');
  });

  it('pairs a result that arrives after its tool use was already grouped', () => {
    const feed = feedOf([run({ callId: 'a', toolInput: 'npm test' })]);
    expect(feed.groups[0].entries[0]).toMatchObject({ status: null });

    const next = appendActivity(feed, run({ type: 'tool_result', callId: 'a', status: 'failed' }));

    expect(next.groups[0].entries[0]).toMatchObject({ status: 'Failed' });
  });

  it('starts empty', () => {
    const feed = createActivityFeed();
    expect(feed.count).toBe(0);
    expect(feed.groups).toEqual([]);
    expect(feed.latest).toBeUndefined();
  });
});
