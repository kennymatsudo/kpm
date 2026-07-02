import { describe, expect, it } from 'vitest';
import type { DevSessionAutomationPhase } from '../../../shared/types';
import { buildPlaceholderContext } from '../../../shared/contextFile';
import { automationPhaseAfterManualCommitResolution, buildProjectContextPrefix } from './DevSessionService';

describe('automationPhaseAfterManualCommitResolution', () => {
  it.each([
    ['fixing_commit_hooks', 'idle'],
    ['needs_attention', 'idle'],
    ['addressing_review', 'ready_for_review'],
    ['fixing_commit_hooks_after_review', 'ready_for_review'],
  ] satisfies [DevSessionAutomationPhase, DevSessionAutomationPhase][])(
    'resolves %s after a successful manual commit',
    (phase, expected) => {
      expect(automationPhaseAfterManualCommitResolution(phase)).toBe(expected);
    },
  );

  it.each([
    null,
    'idle',
    'reviewing',
    'ready_for_review',
  ] satisfies (DevSessionAutomationPhase | null)[])(
    'preserves unrelated phase %s',
    (phase) => {
      expect(automationPhaseAfterManualCommitResolution(phase)).toBe(phase);
    },
  );
});

describe('buildProjectContextPrefix', () => {
  it('excludes placeholder content', () => {
    const placeholder = buildPlaceholderContext('My Project');
    expect(buildProjectContextPrefix({ content: placeholder, filename: 'AGENTS.md' })).toBe('');
  });

  it('excludes a missing context file', () => {
    expect(buildProjectContextPrefix({ content: null })).toBe('');
    expect(buildProjectContextPrefix(null)).toBe('');
  });

  it('wraps real content in a context-file block labeled with the filename', () => {
    const result = buildProjectContextPrefix({ content: '# My Project\n\nConventions.', filename: 'AGENTS.md' });
    expect(result).toBe('<context-file path="AGENTS.md">\n# My Project\n\nConventions.\n</context-file>\n\n');
  });

  it('defaults the label when no filename is returned', () => {
    const result = buildProjectContextPrefix({ content: 'Conventions.' });
    expect(result).toBe('<context-file path="AGENTS.md">\nConventions.\n</context-file>\n\n');
  });
});
