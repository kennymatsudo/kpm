import { describe, expect, it, vi } from 'vitest';
import { createSlackTriageService, type SlackTriageServiceDeps } from '../../src/main/services/core/SlackTriageService';
import type { SlackChannelLinkCreate } from '../../src/main/db/interfaces/slack';

function createDeps(overrides?: Partial<SlackTriageServiceDeps>): SlackTriageServiceDeps {
  return {
    slackChannelLinks: {
      getByProject: vi.fn(() => []),
      getByChannelId: vi.fn(),
      create: vi.fn(),
      get: vi.fn(() => ({
        id: 'link-1',
        project_id: 'project-1',
        channel_id: 'C123',
        channel_name: 'triage',
        last_checked_ts: null,
        created_at: '2026-03-30T00:00:00.000Z',
      })),
      delete: vi.fn(),
      updateLastCheckedTs: vi.fn(),
    },
    slackTriageItems: {
      getExistingMessageTs: vi.fn(() => new Set<string>()),
      getDismissedForThread: vi.fn(() => []),
      getPriorTopics: vi.fn(() => []),
      createBatch: vi.fn(() => []),
      getPending: vi.fn(() => []),
      getByProject: vi.fn(() => []),
      countPending: vi.fn(() => 0),
      get: vi.fn(),
      updateStatus: vi.fn(),
      updateSuggestedAction: vi.fn(),
    },
    planItems: {
      getByProject: vi.fn(() => []),
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      getRootItems: vi.fn(),
      getChildren: vi.fn(),
      getAncestors: vi.fn(),
      delete: vi.fn(),
      moveToTrash: vi.fn(),
      restoreFromTrash: vi.fn(),
      permanentlyDelete: vi.fn(),
      getTrashItems: vi.fn(),
      getArchivedItems: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      updateSyncStatus: vi.fn(),
      updateJiraFields: vi.fn(),
      reorderChildren: vi.fn(),
      getBySource: vi.fn(),
      getHierarchy: vi.fn(),
      getByParentId: vi.fn(),
      search: vi.fn(),
    },
    resolveSlackChannel: vi.fn(async (_projectId: string, channelReference: string) => ({
      id: channelReference,
      name: 'triage',
    })),
    readSlackChannel: vi.fn(async () => []),
    readSlackThread: vi.fn(async () => []),
    sendSlackMessage: vi.fn(async () => undefined),
    getSlackAvailability: vi.fn(async () => ({
      available: true,
      source: 'claude-ai',
      serverName: 'claude.ai Slack',
      reason: null,
    })),
    createTaskFromTriage: vi.fn(),
    applyDocumentUpdate: vi.fn(),
    ...overrides,
  } as SlackTriageServiceDeps;
}

describe('SlackTriageService triggerTriage history reads', () => {
  it('reads channel history without an oldest filter', async () => {
    const deps = createDeps();
    const service = createSlackTriageService(deps);

    const result = await service.triggerTriage('project-1', 'link-1');

    expect(result.ok).toBe(true);
    expect(deps.readSlackChannel).toHaveBeenCalledWith('project-1', 'C123');
  });

  it('does not apply the stored watermark to channel history reads', async () => {
    const deps = createDeps({
      slackChannelLinks: {
        getByProject: vi.fn(() => []),
        getByChannelId: vi.fn(),
        create: vi.fn(),
        get: vi.fn(() => ({
          id: 'link-1',
          project_id: 'project-1',
          channel_id: 'C123',
          channel_name: 'triage',
          last_checked_ts: '1774800000.000000',
          created_at: '2026-03-30T00:00:00.000Z',
        })),
        delete: vi.fn(),
        updateLastCheckedTs: vi.fn(),
      },
    });
    const service = createSlackTriageService(deps);

    const result = await service.triggerTriage('project-1', 'link-1');

    expect(result.ok).toBe(true);
    expect(deps.readSlackChannel).toHaveBeenCalledWith('project-1', 'C123');
  });

  it('filters structural join text even when Slack omits subtype', async () => {
    const deps = createDeps({
      readSlackChannel: vi.fn(async () => [
        {
          ts: '1743358831.626549',
          user: 'U08T3V6RQ8N',
          text: '<@U08T3V6RQ8N> has joined the channel',
        },
      ]),
    });
    const service = createSlackTriageService(deps);

    const result = await service.triggerTriage('project-1', 'link-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messagesProcessed).toBe(0);
      expect(result.data.messagesFiltered).toBe(1);
      expect(result.data.newItems).toEqual([]);
    }
  });
});

describe('SlackTriageService createLink', () => {
  it('resolves the typed channel reference before saving the link', async () => {
    const deps = createDeps({
      slackChannelLinks: {
        getByProject: vi.fn(() => []),
        getByChannelId: vi.fn(() => undefined),
        create: vi.fn((link: SlackChannelLinkCreate) => ({
          id: 'link-1',
          project_id: link.project_id,
          channel_id: link.channel_id,
          channel_name: link.channel_name,
          last_checked_ts: null,
          created_at: '2026-03-30T00:00:00.000Z',
        })),
        get: vi.fn(),
        delete: vi.fn(),
        updateLastCheckedTs: vi.fn(),
      },
      resolveSlackChannel: vi.fn(async () => ({
        id: 'C024BE91L',
        name: 'team-project-updates',
      })),
    });
    const service = createSlackTriageService(deps);

    const result = await service.createLink('project-1', 'team-project-updates', 'team-project-updates');

    expect(result.ok).toBe(true);
    expect(deps.resolveSlackChannel).toHaveBeenCalledWith('project-1', 'team-project-updates');
    expect(deps.slackChannelLinks.getByChannelId).toHaveBeenCalledWith('project-1', 'C024BE91L');
    expect(deps.slackChannelLinks.create).toHaveBeenCalledWith({
      project_id: 'project-1',
      channel_id: 'C024BE91L',
      channel_name: 'team-project-updates',
    });
  });

  it('rejects malformed resolved channel payloads before hitting the repository', async () => {
    const deps = createDeps({
      slackChannelLinks: {
        getByProject: vi.fn(() => []),
        getByChannelId: vi.fn(() => undefined),
        create: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        updateLastCheckedTs: vi.fn(),
      },
      resolveSlackChannel: vi.fn(async () => ({ name: 'team-project-updates' } as { id: string; name: string })),
    });
    const service = createSlackTriageService(deps);

    const result = await service.createLink('project-1', 'team-project-updates', 'team-project-updates');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalid channel payload');
    }
    expect(deps.slackChannelLinks.create).not.toHaveBeenCalled();
  });
});
