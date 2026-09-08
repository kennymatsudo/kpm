import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt, buildFocusSystemPrompt } from './index';
import type { PlanContext } from './types';
import { richMainFixture, makePlanItem } from './__fixtures__/promptContextFixtures';

function buildContext(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    project: {
      id: 'project-1',
      name: 'Test Project',
      folder_path: '/tmp/project-1',
      phase: 'discovery',
      session_tokens: 0,
      session_input_tokens: 0,
      session_output_tokens: 0,
    },
    repos: [],
    attachments: [],
    planItems: [],
    focusedResources: [],
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('is byte-identical across repeated builds of the same context', () => {
    const context = buildContext();
    expect(buildSystemPrompt(context)).toBe(buildSystemPrompt(buildContext()));
  });

  it('includes a static View Context section covering both plan and workspace defaults', () => {
    const prompt = buildSystemPrompt(buildContext());
    expect(prompt).toContain('## View Context');
    expect(prompt).toContain('[Context: …]');
    expect(prompt).toContain('modify_plan');
    expect(prompt).toContain('propose_document_create');
    expect(prompt).toContain('propose_document_edit');
  });

  it('states change application once, neutrally, without mode-specific wording', () => {
    const prompt = buildSystemPrompt(buildContext());
    expect(prompt).toContain('refer to changes as proposed');
    expect(prompt).not.toContain('## Change Application');
    expect(prompt).not.toContain('applies those changes immediately');
    expect(prompt).not.toContain('will approve, edit, or dismiss');
    expect(prompt).not.toContain('Do not tell the user they will need to approve a modal');
  });

  it('does not vary tool-decision wording by approval mode', () => {
    const prompt = buildSystemPrompt(buildContext());
    expect(prompt).not.toContain('Action tools apply immediately');
    expect(prompt).not.toContain('Action tools require user review');
    expect(prompt).not.toContain('delete immediately');
    expect(prompt).not.toContain('propose deletion for user confirmation');
  });

  it('grounds every chat provider with connected repo IDs and effective paths', () => {
    const prompt = buildSystemPrompt(buildContext({
      repos: [{ id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1' }],
    }));

    expect(prompt).toContain('ID: `repo-1` — path: `/tmp/repo-1`');
  });

  it('folds in the user global instructions when present', () => {
    const prompt = buildSystemPrompt(
      buildContext({ userGlobalInstructions: 'Lead with the answer.' })
    );
    expect(prompt).toContain('# User Global Preferences');
    expect(prompt).toContain('Lead with the answer.');
  });

  it('omits the global instructions section when absent or blank', () => {
    expect(buildSystemPrompt(buildContext())).not.toContain('# User Global Preferences');
    expect(
      buildSystemPrompt(buildContext({ userGlobalInstructions: '   ' }))
    ).not.toContain('# User Global Preferences');
  });

  it('describes file access with capability-neutral wording, not Grep/Glob/Read', () => {
    const prompt = buildSystemPrompt(buildContext({
      repos: [{ id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1' }],
      attachments: [{ id: 'att-1', project_id: 'project-1', path: '/tmp/project-1/attachments/spec.md', filename: 'spec.md' }],
      planItems: [makePlanItem('11111111-1111-4111-8111-111111111111', { title: 'Ship export pipeline' })],
      taskPromptTemplate: {
        id: 'tpl-1',
        project_id: 'project-1',
        name: 'Standard',
        prompt_content: 'Write clear acceptance criteria.',
        is_default: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      userGlobalInstructions: 'Lead with the answer.',
      contextFileContent: '# Project notes\nUse the shared client.',
    }));

    expect(prompt).toContain("The first file write, shell command, or state-changing git operation pauses for the user to enable writes for the conversation");
    expect(prompt).toContain('Your file tools can also read any other folder on disk when the user points you at one — you are not limited to the project folder and connected repos for reading.');

    expect(prompt).not.toContain('Connected repos are read-only in chat.');
    expect(prompt).not.toContain('Use Grep/Glob/Read to explore them. You can edit repo files only when the user explicitly asks and KPM permits it.');
    expect(prompt).not.toContain('Read/Grep/Glob reach any folder on disk — the project, connected repos, or any other path the user points you to.');
    expect(prompt).not.toContain('Read/Grep/Glob can also reach any other folder on disk when the user points you at one — you are not limited to the project folder and connected repos for reading.');
  });

  it('matches the committed prompt baseline', () => {
    const baseline = readFileSync(
      fileURLToPath(new URL('./__fixtures__/claudeMainBaseline.txt', import.meta.url)),
      'utf8'
    ).replace(/\r?\n$/, '');

    expect(buildSystemPrompt(richMainFixture)).toBe(baseline);
  });
});

describe('buildFocusSystemPrompt', () => {
  it('folds in the user global instructions when present', () => {
    const prompt = buildFocusSystemPrompt(
      buildContext({ userGlobalInstructions: 'Skip filler openers.' })
    );
    expect(prompt).toContain('# User Global Preferences');
    expect(prompt).toContain('Skip filler openers.');
  });

  it('omits the global instructions section when absent', () => {
    expect(buildFocusSystemPrompt(buildContext())).not.toContain('# User Global Preferences');
  });
});
