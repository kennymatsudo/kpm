import { describe, expect, it, vi } from 'vitest';
import { buildPlaceholderContext } from '../../../shared/contextFile';
import { buildProjectContextPrefix, createDevSessionService } from './DevSessionService';
import { FollowUpNotAllowedError } from '../agents/BaseAgentSession';
import { BUILT_IN_PLAYBOOKS } from '../../../shared/playbooks';

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));

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

describe('DevSessionService playbook migration boundary', () => {
  it('snapshots every newly created board session for interpreter execution', async () => {
    const create = vi.fn((session) => ({
      ...session,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      completed_at: null,
    }));
    const service = createDevSessionService({
      planItems: { get: vi.fn(() => ({ id: 'item-1', project_id: 'project-1', title: 'Task', work_brief_revision: 7 })) },
      repos: { getById: vi.fn(() => ({ id: 'repo-1', path: '/tmp/repo' })) },
      devSessions: { getActiveByPlanItem: vi.fn(), create },
      appSettings: { get: vi.fn() },
    } as never);

    const result = await service.createPendingSession('item-1', 'repo-1', 'Do work', {
      baseBranch: 'main',
      playbook: BUILT_IN_PLAYBOOKS.implementOnly,
    });

    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      work_brief_revision: 7,
      playbook_id: BUILT_IN_PLAYBOOKS.implementOnly.id,
      playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOnly),
      current_step_id: 'implement',
    });
  });

  it('resumes with stored initial instructions instead of rebuilding the latest Work Brief', async () => {
    const existing = {
      id: 'session-1', project_id: 'project-1', plan_item_id: 'item-1', repo_id: 'repo-1',
      status: 'inactive', initial_instructions: 'Captured revision 2 contract',
      work_brief_revision: 2, playbook_snapshot: JSON.stringify(BUILT_IN_PLAYBOOKS.implementOnly),
      current_step_id: 'implement', automation_phase: null,
    };
    const startAgentSession = vi.fn().mockImplementation(async (_id, options) => ({
      ok: true, data: { session: { ...existing, launchedPrompt: options.prompt } },
    }));
    const service = createDevSessionService({
      planItems: {
        get: vi.fn(() => ({ id: 'item-1', project_id: 'project-1', title: 'Latest title', description: 'Latest context' })),
        getByProject: vi.fn(() => []),
      },
      devSessions: {
        getByPlanItem: vi.fn(() => existing), get: vi.fn(() => existing), updateReviewPolicy: vi.fn(),
      },
      listBoardProviders: vi.fn(async () => [{
        id: 'claude', name: 'Claude', available: true,
        models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }],
        capabilities: { nativeSkills: true, reviewSandbox: false },
      }]),
      appSettings: { get: vi.fn() },
      readProjectContextFile: vi.fn(async () => ({ ok: true, data: { content: null } })),
      buildContextPrefix: vi.fn(),
      getPromptContent: vi.fn(() => ''),
      getSkillBody: vi.fn(),
    } as never);
    (service as unknown as { startAgentSession: typeof startAgentSession }).startAgentSession = startAgentSession;

    await service.createAndStartFromBoard({ planItemId: 'item-1', repoId: 'repo-1' });

    expect(startAgentSession).toHaveBeenCalledWith('session-1', expect.objectContaining({
      prompt: expect.stringContaining('Captured revision 2 contract'),
    }));
    expect(startAgentSession.mock.calls[0][1].prompt).not.toContain('Latest context');
  });
});

describe('DevSessionService.sendAgentFollowUp', () => {
  it('defers instead of restarting when the live session rejects with FollowUpNotAllowedError and restartIfBusy is false', async () => {
    const followUp = vi.fn().mockRejectedValue(new FollowUpNotAllowedError('working'));
    const markLatestCompletedStale = vi.fn();
    const startAgentSession = vi.fn();

    const service = createDevSessionService({
      agentReviews: { markLatestCompletedStale },
      agentSessionManager: {
        getByDevSession: vi.fn(() => ({ followUp })),
      },
      devSessions: {
        get: vi.fn(),
        updateStatus: vi.fn(),
      },
    } as never);

    // Patch after construction so the fallback restart path (unreachable here) doesn't need a full mock.
    (service as unknown as { startAgentSession: typeof startAgentSession }).startAgentSession = startAgentSession;

    const result = await service.sendAgentFollowUp('session-1', 'keep going', { restartIfBusy: false });

    expect(result).toEqual({ ok: true, data: { restarted: false, deferred: true } });
    expect(markLatestCompletedStale).toHaveBeenCalledWith('session-1');
    expect(startAgentSession).not.toHaveBeenCalled();
  });

  it('falls back to a restart when followUp rejects with a plain error', async () => {
    const followUp = vi.fn().mockRejectedValue(new Error('No SDK session to resume — session may have been cleaned up'));
    const session = {
      id: 'session-1',
      status: 'active',
      initial_instructions: 'Original task',
    };
    const updateStatus = vi.fn();
    const startAgentSession = vi.fn().mockResolvedValue({ ok: true, data: { session } });

    const service = createDevSessionService({
      agentReviews: { markLatestCompletedStale: vi.fn() },
      agentSessionManager: {
        getByDevSession: vi.fn(() => ({ followUp })),
      },
      devSessions: {
        get: vi.fn(() => session),
        updateStatus,
      },
    } as never);

    (service as unknown as { startAgentSession: typeof startAgentSession }).startAgentSession = startAgentSession;

    const result = await service.sendAgentFollowUp('session-1', 'keep going', { restartIfBusy: false });

    expect(result).toEqual({ ok: true, data: { restarted: true } });
    expect(updateStatus).toHaveBeenCalledWith('session-1', 'inactive');
    expect(startAgentSession).toHaveBeenCalled();
  });
});
