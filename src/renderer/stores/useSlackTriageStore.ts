/**
 * Slack Triage Store
 *
 * Manages Slack channel links and the triage queue UI state.
 */

import { create } from 'zustand';
import type {
  SlackChannelLink,
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
  executeSlackItem,
} from '../services/slackService';

interface SlackTriageState {
  // Data
  channelLinks: SlackChannelLink[];
  pendingItems: SlackTriageItem[];
  allItems: SlackTriageItem[];
  pendingCount: number;

  // UI state
  isLoadingLinks: boolean;
  isTriaging: boolean;
  isPanelOpen: boolean;
  error: string | null;

  // Actions
  loadLinks: (projectId: string) => Promise<void>;
  loadPendingItems: (projectId: string) => Promise<void>;
  loadAllItems: (projectId: string) => Promise<void>;
  loadPendingCount: (projectId: string) => Promise<void>;
  createLink: (projectId: string, channelId: string, channelName: string) => Promise<SlackChannelLink | null>;
  deleteLink: (linkId: string, projectId: string) => Promise<void>;
  approveItem: (itemId: string, projectId: string) => Promise<void>;
  editItem: (itemId: string, suggestedAction: unknown, projectId: string) => Promise<void>;
  dismissItem: (itemId: string, projectId: string) => Promise<void>;
  executeItem: (itemId: string, projectId: string) => Promise<void>;
  setPanelOpen: (open: boolean) => void;
  reset: () => void;
}

const initialState = {
  channelLinks: [] as SlackChannelLink[],
  pendingItems: [] as SlackTriageItem[],
  allItems: [] as SlackTriageItem[],
  pendingCount: 0,
  isLoadingLinks: false,
  isTriaging: false,
  isPanelOpen: false,
  error: null as string | null,
};

export const useSlackTriageStore = create<SlackTriageState>((set, get) => ({
  ...initialState,

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
      await get().loadPendingItems(projectId);
      await get().loadPendingCount(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to approve item' });
    }
  },

  editItem: async (itemId: string, suggestedAction: unknown, projectId: string) => {
    try {
      await get().loadPendingItems(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to edit item' });
    }
  },

  dismissItem: async (itemId: string, projectId: string) => {
    try {
      await get().loadPendingItems(projectId);
      await get().loadPendingCount(projectId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to dismiss item' });
    }
  },

  executeItem: async (itemId: string, projectId: string) => {
    try {
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to execute item' });
    }
  },

  setPanelOpen: (open: boolean) => set({ isPanelOpen: open }),

  reset: () => set(initialState),
}));
