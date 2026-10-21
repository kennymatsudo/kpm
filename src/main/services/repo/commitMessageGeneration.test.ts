import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCommitMessage } from './commitMessageGeneration';

const runGeneration = vi.hoisted(() => vi.fn());

vi.mock('../../generation', () => ({ runGeneration }));
vi.mock('../../config', () => ({
  getConfig: () => ({ generation: { prGenerationTimeoutMs: 1000 } }),
}));

const baseInput = {
  diff: 'diff --git a/pool.py b/pool.py\n+MAX_CHECKOUTS = 4\n',
  taskTitle: 'Keep Zendesk openings from exhausting the pool',
  instructions: 'Subject: 50 chars max.',
  projectId: 'project-1',
};

describe('generateCommitMessage', () => {
  beforeEach(() => {
    runGeneration.mockReset();
  });

  it('declines an empty diff without asking the model', async () => {
    const result = await generateCommitMessage({ ...baseInput, diff: '  \n' });

    expect(result.ok).toBe(false);
    expect(runGeneration).not.toHaveBeenCalled();
  });

  it('returns the trimmed message the model wrote from the diff', async () => {
    runGeneration.mockResolvedValue({ text: '  Cap pool checkouts\n', outcome: { status: 'completed' }, errors: [] });

    const result = await generateCommitMessage(baseInput);

    expect(result).toEqual({ ok: true, data: 'Cap pool checkouts' });
    expect(runGeneration.mock.calls[0][0].prompt).toContain('+MAX_CHECKOUTS = 4');
  });

  it('fails when the run does not complete, so callers fall back', async () => {
    runGeneration.mockResolvedValue({ text: 'partial', outcome: { status: 'error', detail: 'timed out' }, errors: [] });

    const result = await generateCommitMessage(baseInput);

    expect(result).toEqual({ ok: false, error: 'timed out' });
  });

  it('fails instead of throwing when generation throws', async () => {
    runGeneration.mockRejectedValue(new Error('Commit message generation timed out'));

    const result = await generateCommitMessage(baseInput);

    expect(result).toEqual({ ok: false, error: 'Commit message generation timed out' });
  });
});
