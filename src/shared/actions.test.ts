import { describe, expect, it } from 'vitest';
import {
  formatTrigger,
  getActionValidationIssues,
  type ActionEditable,
} from './actions';

const base: ActionEditable = {
  name: 'Doc drift check',
  description: '',
  projectId: '11111111-1111-4111-8111-111111111111',
  prompt: 'Compare the docs to the code and report anything stale.',
  icon: 'document',
  keywords: '',
  trigger: { kind: 'manual' },
  enabled: true,
  capabilities: ['read_project'],
  manualRun: 'headless',
  targetType: 'none',
  model: null,
};

function issuesFor(overrides: Partial<ActionEditable>): string[] {
  return getActionValidationIssues({ ...base, ...overrides }).map((issue) => issue.message);
}

describe('actionEditableSchema', () => {
  it('expresses a manual chat command with no output grant', () => {
    expect(issuesFor({ manualRun: 'chat', targetType: 'document' })).toEqual([]);
  });

  it('expresses a manual artifact command', () => {
    expect(issuesFor({ capabilities: ['read_project', 'write_outputs'] })).toEqual([]);
  });

  it('expresses the read-only loop output modes as capability grants', () => {
    const interval = { kind: 'interval', minutes: 60 } as const;
    expect(issuesFor({ trigger: interval, capabilities: ['read_project', 'report_finding'] })).toEqual([]);
    expect(issuesFor({ trigger: interval, capabilities: ['read_project', 'write_outputs'] })).toEqual([]);
  });

  it('expresses a combination the old output_mode enum could not', () => {
    expect(issuesFor({
      trigger: { kind: 'interval', minutes: 60 },
      capabilities: ['read_project', 'report_finding', 'write_outputs'],
    })).toEqual([]);
  });

  it('blocks a triggered propose grant until proposals persist', () => {
    const issues = issuesFor({
      trigger: { kind: 'interval', minutes: 60 },
      manualRun: 'chat',
      capabilities: ['read_project', 'propose_documents'],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('cannot propose changes yet');
  });

  it('allows a propose grant on a manual chat run', () => {
    expect(issuesFor({ manualRun: 'chat', capabilities: ['read_project', 'propose_documents'] })).toEqual([]);
    expect(issuesFor({ manualRun: 'chat', capabilities: ['read_project', 'propose_plan'] })).toEqual([]);
  });

  it('refuses a propose grant on a headless run, which has nowhere to review', () => {
    const issues = issuesFor({ capabilities: ['read_project', 'propose_documents'] });
    expect(issues).toEqual([
      'An action that proposes changes has to run in chat, where the changes can be reviewed.',
    ]);
  });

  it('rejects a triggered action that produces nothing observable', () => {
    const issues = issuesFor({ trigger: { kind: 'interval', minutes: 30 } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('leaves no trace');
  });

  it('rejects a triggered action that asks for a target', () => {
    const issues = issuesFor({
      trigger: { kind: 'interval', minutes: 30 },
      capabilities: ['read_project', 'report_finding'],
      targetType: 'repo',
    });
    expect(issues).toEqual(['A triggered action cannot ask for a target — nobody is there to pick one.']);
  });

  it('bounds the interval', () => {
    expect(issuesFor({ trigger: { kind: 'interval', minutes: 1 }, capabilities: ['read_project', 'report_finding'] })).toHaveLength(1);
    expect(issuesFor({ trigger: { kind: 'interval', minutes: 20161 }, capabilities: ['read_project', 'report_finding'] })).toHaveLength(1);
  });

  it('requires a project for a board-agent trigger', () => {
    const issues = issuesFor({
      projectId: null,
      trigger: { kind: 'event', event: 'board_agent_finished' },
      capabilities: ['read_project', 'report_finding'],
    });
    expect(issues).toEqual(['A board-agent trigger belongs to one project.']);
  });

  it('allows a global action on a project-agnostic event', () => {
    expect(issuesFor({
      projectId: null,
      trigger: { kind: 'event', event: 'app_opened' },
      capabilities: ['read_project', 'report_finding'],
    })).toEqual([]);
  });

  it('rejects a duplicated capability grant', () => {
    const issues = issuesFor({ capabilities: ['read_project', 'read_project'] });
    expect(issues).toEqual(['Capability "read_project" is granted more than once.']);
  });

  it('tags issues so the editor can anchor them', () => {
    const issues = getActionValidationIssues({ ...base, trigger: { kind: 'interval', minutes: 30 } });
    expect(issues[0]).toMatchObject({ kind: 'capability', field: 'capabilities' });
  });
});

describe('formatTrigger', () => {
  it('labels each trigger kind', () => {
    expect(formatTrigger({ kind: 'manual' })).toBe('Manual');
    expect(formatTrigger({ kind: 'interval', minutes: 30 })).toBe('Every 30m');
    expect(formatTrigger({ kind: 'interval', minutes: 240 })).toBe('Every 4h');
    expect(formatTrigger({ kind: 'interval', minutes: 1440 })).toBe('Daily');
    expect(formatTrigger({ kind: 'interval', minutes: 90 })).toBe('Every 90m');
    expect(formatTrigger({ kind: 'event', event: 'board_agent_finished' })).toBe('When an agent finishes');
  });
});
