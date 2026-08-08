import { describe, expect, it } from 'vitest';
import type { AgentActivity } from '../../../shared/agent-types';
import { presentActivities } from './activityPresentation';

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
