/**
 * Slack Triage Store
 *
 * Manages Slack channel links and the triage queue UI state.
 */

import { create } from 'zustand';
import { sendChatMessage, startNewBackendChatSession } from '../services/chatService';
import { useChatStore } from './chat';
import { usePlanDomainStore, useProjectUiDomainStore } from './projectDomains';
import { useExportStore } from './tracker/useExportStore';
import type {
  FocusedResource,
  SlackChannelLink,
  SlackTriageCreateTaskAction,
  SlackTriageItem,
} from '../../shared/types';
import {
  listSlackLinks,
  createSlackLink,
  deleteSlackLink,
  triggerSlackTriage,
  getSlackPendingItems,
  getAllSlackTriageItems,
  countSlackPending,
  approveSlackItem,
  editSlackItem,
  dismissSlackItem,
  restoreSlackItem,
  executeSlackItem,
  getSlackAvailability,
} from '../services/slackService';
import { emit } from './storeEvents';
import { toast } from './toastStore';

interface TriageResultSummary {
  messagesRead: number;
  messagesProcessed: number;
  messagesFiltered: number;
  filterBreakdown: { bot_message: number; already_triaged: number; structural: number };
  newItemsCount: number;
  channelsChecked: number;
}

interface SlackTriageState {
  // Data
  channelLinks: SlackChannelLink[];
  pendingItems: SlackTriageItem[];
  allItems: SlackTriageItem[];
  historyItems: SlackTriageItem[];
  pendingCount: number;

  // UI state
  isLoadingLinks: boolean;
  isTriaging: boolean;
  isPanelOpen: boolean;
  activeTab: 'pending' | 'history';
  lastTriageResult: TriageResultSummary | null;
  error: string | null;

  // Availability (Slack MCP connection state). null = not yet checked.
  isAvailable: boolean | null;

  // Actions
  loadAvailability: () => Promise<void>;
  loadLinks: (projectId: string) => Promise<void>;
  loadPendingItems: (projectId: string) => Promise<void>;
  loadAllItems: (projectId: string) => Promise<void>;
  loadHistoryItems: (projectId: string) => Promise<void>;
  loadPendingCount: (projectId: string) => Promise<void>;
  createLink: (projectId: string, channelId: string, channelName: string) => Promise<SlackChannelLink | null>;
  deleteLink: (linkId: string, projectId: string) => Promise<void>;
  triggerTriage: (
    projectId: string,
    channelLinkId: string
  ) => Promise<{ messagesRead: number; messagesProcessed: number; messagesFiltered: number; filterBreakdown: { bot_message: number; already_triaged: number; structural: number }; newItems: SlackTriageItem[] } | null>;
  approveItem: (itemId: string, projectId: string) => Promise<void>;
  editItem: (itemId: string, suggestedAction: unknown, projectId: string) => Promise<void>;
  dismissItem: (itemId: string, projectId: string) => Promise<void>;
  restoreItem: (itemId: string, projectId: string) => Promise<void>;
  executeItem: (itemId: string, projectId: string) => Promise<void>;
  investigateItem: (item: SlackTriageItem, projectId: string) => Promise<void>;
  setPanelOpen: (open: boolean) => void;
  setActiveTab: (tab: 'pending' | 'history') => void;
  setLastTriageResult: (result: TriageResultSummary | null) => void;
  reset: () => void;
}

const initialState = {
  channelLinks: [] as SlackChannelLink[],
  pendingItems: [] as SlackTriageItem[],
  allItems: [] as SlackTriageItem[],
  historyItems: [] as SlackTriageItem[],
  pendingCount: 0,
  isLoadingLinks: false,
  isTriaging: false,
  isPanelOpen: false,
  activeTab: 'pending' as const,
  lastTriageResult: null as TriageResultSummary | null,
  error: null as string | null,
  isAvailable: null as boolean | null,
};

function assertSuccess(result: { success: boolean; error?: string }, fallback: string): void {
  if (!result.success) {
    throw new Error(result.error ?? fallback);
  }
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'slack-investigation';
}

function getCreateTaskAction(item: SlackTriageItem): SlackTriageCreateTaskAction | null {
  if (item.action_type !== 'create_task' || !item.suggested_action) return null;
  return item.suggested_action as SlackTriageCreateTaskAction;
}

function buildInvestigationPrompt(item: SlackTriageItem): string {
  const action = getCreateTaskAction(item);
  const title = action?.title ?? item.topic_summary;
  const date = new Date().toISOString().slice(0, 10);
  const investigationPath = `investigations/${date}-${slugify(title)}-${item.id.slice(0, 8)}.md`;
  const labels = action?.labels?.filter(Boolean).join(', ') || '(none)';

  return `Investigate this Slack-reported issue before creating any task.

Important constraints:
- Do not create or modify plan items.
- Do not queue anything to Jira or Linear.
- Use repository and project context to investigate before writing conclusions.
- When the investigation is complete, create exactly one Markdown investigation document with propose_document_create at:
  ${investigationPath}
- If the evidence is inconclusive, say that in the document and list the open questions.

The investigation document should include:
- Slack source and summary
- Reported behavior
- Impact / severity assessment
- Reproduction notes or missing reproduction details
- Relevant repo/code references, if found
- Findings and likely causes
- Open questions
- Recommended next step
- A short section titled "Task Readiness" that states whether this is ready to promote into an execution task

Slack triage item:
- Topic: ${item.topic_summary}
- Author: ${item.author_name}
- Source message timestamps: ${item.source_messages.join(', ')}
- Thread timestamp: ${item.thread_ts ?? '(none)'}
- Latest reply timestamp: ${item.latest_reply_ts ?? '(none)'}
- Slack excerpt: ${item.source_text}

Initial triage suggestion:
- Title: ${title}
- Suggested status: ${action?.suggested_status ?? '(none)'}
- Suggested parent: ${action?.suggested_parent ?? '(none)'}
- Labels: ${labels}
- Description:
${action?.description ?? '(none)'}
`;
}

async function startChatInvestigation(item: SlackTriageItem, projectId: string): Promise<void> {
  const chatState = useChatStore.getState();
  const chatSessionId = chatState.startNewChatSession(true);
  const clientMessageId = crypto.randomUUID();
  const message = buildInvestigationPrompt(item);

  const backendSession = await startNewBackendChatSession(projectId);
  assertSuccess(backendSession, 'Failed to start investigation chat');

  const latestChatState = useChatStore.getState();
  await latestChatState.openChatChoice(projectId, chatSessionId);
  latestChatState.addUserMessage(chatSessionId, message);

  const uiState = useProjectUiDomainStore.getState();
  const focusedResources: FocusedResource[] =
    uiState.focusedResourcesBySession[chatSessionId] ?? uiState.focusedResources;

  const result = await sendChatMessage({
    projectId,
    message,
    focusedResources,
    chatSessionId,
    currentView: 'workspace',
    clientMessageId,
  });

  if (!result.success) {
    latestChatState.setError(chatSessionId, result.error ?? 'Failed to start investigation');
    throw new Error(result.error ?? 'Failed to start investigation');
  }
}

export const useSlackTriageStore = create<SlackTriageState>((set, get) => ({
  ...initialState,

  loadAvailability: async () => {
    try {
      const result = await getSlackAvailability();
      set({ isAvailable: result.available });
    } catch {
      set({ isAvailable: false });
    }
  },

  loadLinks: async (projectId: string) => {
    set({ isLoadingLinks: true, error: null });
    try {
      const links = await listSlackLinks(projectId);
      set({ channelLinks: links, isLoadingLinks: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load channel links', isLoadingLinks: false });
    }
  },

  loadPendingItems: async (projectId: string) => {
    try {
      const items = await getSlackPendingItems(projectId);
      set({ pendingItems: items });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load pending items' });
    }
  },

  loadAllItems: async (projectId: string) => {
    try {
      const items = await getAllSlackTriageItems(projectId);
      set({ allItems: items });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load triage items' });
    }
  },

  loadHistoryItems: async (projectId: string) => {
    try {
      const items = await getAllSlackTriageItems(projectId);
      set({ historyItems: items.filter(i => i.status !== 'pending') });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load history items' });
    }
  },

  loadPendingCount: async (projectId: string) => {
    try {
      const count = await countSlackPending(projectId);
      set({ pendingCount: count });
    } catch {
      // Silently fail on count — non-critical
    }
  },

  createLink: async (projectId: string, channelId: string, channelName: string) => {
    set({ error: null });
    try {
      const link = await createSlackLink(projectId, channelId, channelName);
      await get().loadLinks(projectId);
      return link;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create channel link' });
      return null;
    }
  },

  deleteLink: async (linkId: string, projectId: string) => {
    set({ error: null });
    try {
      const result = await deleteSlackLink(linkId);
      assertSuccess(result, 'Failed to delete channel link');
      await get().loadLinks(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete channel link' });
    }
  },

  triggerTriage: async (projectId: string, channelLinkId: string) => {
    set({ isTriaging: true, error: null });
    try {
      const result = await triggerSlackTriage(projectId, channelLinkId);
      await get().loadPendingItems(projectId);
      await get().loadPendingCount(projectId);
      set({ isTriaging: false });
      return result;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Triage failed', isTriaging: false });
      return null;
    }
  },

  approveItem: async (itemId: string, projectId: string) => {
    try {
      const result = await approveSlackItem(itemId);
      assertSuccess(result, 'Failed to approve item');
      await get().loadPendingItems(projectId);
      await get().loadPendingCount(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to approve item' });
    }
  },

  editItem: async (itemId: string, suggestedAction: unknown, projectId: string) => {
    try {
      const result = await editSlackItem(itemId, suggestedAction);
      assertSuccess(result, 'Failed to edit item');
      await get().loadPendingItems(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to edit item' });
    }
  },

  dismissItem: async (itemId: string, projectId: string) => {
    try {
      const result = await dismissSlackItem(itemId);
      assertSuccess(result, 'Failed to dismiss item');
      await get().loadPendingItems(projectId);
      await get().loadPendingCount(projectId);
      await get().loadHistoryItems(projectId);
      toast.success('Item dismissed', {
        label: 'Undo',
        onClick: () => { void get().restoreItem(itemId, projectId); },
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to dismiss item' });
    }
  },

  restoreItem: async (itemId: string, projectId: string) => {
    try {
      const result = await restoreSlackItem(itemId);
      assertSuccess(result, 'Failed to restore item');
      await get().loadPendingItems(projectId);
      await get().loadPendingCount(projectId);
      await get().loadHistoryItems(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to restore item' });
    }
  },

  executeItem: async (itemId: string, projectId: string) => {
    set({ error: null });
    try {
      const result = await executeSlackItem(itemId);
      assertSuccess(result, 'Failed to execute item');
      await Promise.all([
        get().loadPendingItems(projectId),
        get().loadPendingCount(projectId),
        usePlanDomainStore.getState().refreshPlanItems(),
        useExportStore.getState().refreshQueueCount(projectId),
      ]);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to execute item' });
    }
  },

  investigateItem: async (item: SlackTriageItem, projectId: string) => {
    set({ error: null });
    try {
      await startChatInvestigation(item, projectId);
      emit({ type: 'navigate-to-view', payload: { view: 'workspace', showChat: true } });
      set({ isPanelOpen: false });
      toast.success('Investigation started');
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to start investigation' });
    }
  },

  setPanelOpen: (open: boolean) => set({ isPanelOpen: open }),
  setActiveTab: (tab: 'pending' | 'history') => set({ activeTab: tab }),
  setLastTriageResult: (result: TriageResultSummary | null) => set({ lastTriageResult: result }),

  reset: () => set(initialState),
}));
