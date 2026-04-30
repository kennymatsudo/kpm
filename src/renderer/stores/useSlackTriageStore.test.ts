import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from './chat';
import { usePlanDomainStore, useProjectUiDomainStore } from './projectDomains';
import { useExportStore } from './tracker/useExportStore';
import { useSlackTriageStore } from './useSlackTriageStore';
import * as slackService from '../services/slackService';
import * as chatService from '../services/chatService';
import { subscribe } from './storeEvents';
import type { SlackTriageItem } from '../../shared/types';

vi.mock('../services/slackService', () => ({
  listSlackLinks: vi.fn(),
  createSlackLink: vi.fn(),
  deleteSlackLink: vi.fn(),
  triggerSlackTriage: vi.fn(),
  getSlackPendingItems: vi.fn(),
  getAllSlackTriageItems: vi.fn(),
  countSlackPending: vi.fn(),
  approveSlackItem: vi.fn(),
  editSlackItem: vi.fn(),
  dismissSlackItem: vi.fn(),
  restoreSlackItem: vi.fn(),
  executeSlackItem: vi.fn(),
  getSlackAvailability: vi.fn(),
}));

vi.mock('../services/chatService', () => ({
  sendChatMessage: vi.fn(),
  startNewBackendChatSession: vi.fn(),
}));

describe('useSlackTriageStore', () => {
  const originalRefreshPlanItems = usePlanDomainStore.getState().refreshPlanItems;
  const originalRefreshQueueCount = useExportStore.getState().refreshQueueCount;

  let refreshPlanItems: ReturnType<typeof vi.fn>;
  let refreshQueueCount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useChatStore.getState().reset();
    useSlackTriageStore.getState().reset();
    useExportStore.getState().reset();
    useProjectUiDomainStore.getState().clearFocusedResources();

    refreshPlanItems = vi.fn().mockResolvedValue(undefined);
    refreshQueueCount = vi.fn().mockResolvedValue(undefined);
    usePlanDomainStore.setState({
      currentProjectId: 'project-1',
      refreshPlanItems,
    } as Partial<ReturnType<typeof usePlanDomainStore.getState>>);
    useExportStore.setState({
      refreshQueueCount,
    } as Partial<ReturnType<typeof useExportStore.getState>>);

    vi.mocked(slackService.getSlackPendingItems).mockResolvedValue([]);
    vi.mocked(slackService.countSlackPending).mockResolvedValue(0);
    vi.mocked(slackService.getAllSlackTriageItems).mockResolvedValue([]);
    vi.mocked(slackService.getSlackAvailability).mockResolvedValue({
      available: true,
      source: 'user',
      serverName: 'slack',
      reason: null,
    });
    vi.mocked(chatService.startNewBackendChatSession).mockResolvedValue({ success: true });
    vi.mocked(chatService.sendChatMessage).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    usePlanDomainStore.setState({
      currentProjectId: null,
      refreshPlanItems: originalRefreshPlanItems,
    } as Partial<ReturnType<typeof usePlanDomainStore.getState>>);
    useExportStore.setState({
      refreshQueueCount: originalRefreshQueueCount,
    } as Partial<ReturnType<typeof useExportStore.getState>>);
  });

  it('refreshes the board and export queue after executing a triage item', async () => {
    vi.mocked(slackService.executeSlackItem).mockResolvedValue({ success: true });

    await useSlackTriageStore.getState().executeItem('triage-1', 'project-1');

    expect(slackService.executeSlackItem).toHaveBeenCalledWith('triage-1');
    expect(slackService.getSlackPendingItems).toHaveBeenCalledWith('project-1');
    expect(slackService.countSlackPending).toHaveBeenCalledWith('project-1');
    expect(refreshPlanItems).toHaveBeenCalledTimes(1);
    expect(refreshQueueCount).toHaveBeenCalledWith('project-1');
    expect(useSlackTriageStore.getState().error).toBeNull();
  });

  it('surfaces execution failures without refreshing the board', async () => {
    vi.mocked(slackService.executeSlackItem).mockResolvedValue({
      success: false,
      error: 'Could not create task',
    });

    await useSlackTriageStore.getState().executeItem('triage-1', 'project-1');

    expect(useSlackTriageStore.getState().error).toBe('Could not create task');
    expect(slackService.getSlackPendingItems).not.toHaveBeenCalled();
    expect(slackService.countSlackPending).not.toHaveBeenCalled();
    expect(refreshPlanItems).not.toHaveBeenCalled();
    expect(refreshQueueCount).not.toHaveBeenCalled();
  });

  it('starts a workspace chat investigation for create-task triage items', async () => {
    const navigationEvents: unknown[] = [];
    const unsubscribe = subscribe('navigate-to-view', (event) => {
      navigationEvents.push(event.payload);
    });
    const item: SlackTriageItem = {
      id: 'triage-12345678',
      channel_link_id: 'link-1',
      source_messages: ['1710000000.000000'],
      thread_ts: '1710000000.000000',
      latest_reply_ts: '1710000001.000000',
      author_name: 'Support Ops',
      source_text: 'Customer reports the widget fails to load after checkout.',
      topic_summary: 'Widget fails after checkout',
      action_type: 'create_task',
      suggested_action: {
        title: 'Investigate widget load failure after checkout',
        description: 'Customer reports the widget fails to load after checkout.',
        suggested_status: 'not_started',
        suggested_parent: null,
        labels: ['bug'],
      },
      context_used: ['thread_content'],
      status: 'pending',
      resolved_at: null,
      created_at: '2026-04-28T00:00:00.000Z',
    };

    try {
      await useSlackTriageStore.getState().investigateItem(item, 'project-1');
    } finally {
      unsubscribe();
    }

    expect(chatService.startNewBackendChatSession).toHaveBeenCalledWith('project-1');
    expect(chatService.sendChatMessage).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(chatService.sendChatMessage).mock.calls[0][0];
    expect(sent.projectId).toBe('project-1');
    expect(sent.currentView).toBe('workspace');
    expect(sent.message).toContain('Investigate this Slack-reported issue before creating any task');
    expect(sent.message).toContain('Do not create or modify plan items');
    expect(sent.message).toContain('propose_document_create');
    expect(sent.message).toContain('investigations/');
    expect(sent.message).toContain('Customer reports the widget fails to load after checkout.');
    expect(useChatStore.getState().viewedSessionId).toBe(sent.chatSessionId);
    expect(navigationEvents).toContainEqual({ view: 'workspace', showChat: true });
    expect(useSlackTriageStore.getState().isPanelOpen).toBe(false);
    expect(slackService.executeSlackItem).not.toHaveBeenCalled();
  });
});
