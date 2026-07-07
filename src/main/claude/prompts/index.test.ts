import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './index';
import type { PlanContext } from './types';

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

  it('includes the neutral Change Application section without mode-specific wording', () => {
    const prompt = buildSystemPrompt(buildContext());
    expect(prompt).toContain('## Change Application');
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
});
