import type { SlackChannelLink, SlackTriageItem } from '../../shared/types';

// Channel Links
export function listSlackLinks(projectId: string): Promise<SlackChannelLink[]> {
  return window.api.slack.links.list(projectId);
}

export function createSlackLink(projectId: string, channelId: string, channelName: string): Promise<SlackChannelLink> {
  return window.api.slack.links.create(projectId, channelId, channelName);
}

export function deleteSlackLink(linkId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.slack.links.delete(linkId);
}

// Triage
export function triggerSlackTriage(projectId: string, channelLinkId: string): Promise<{ newItems: SlackTriageItem[]; messagesRead: number; messagesProcessed: number; messagesFiltered: number; filterBreakdown: { bot_message: number; already_triaged: number; structural: number } }> {
  return window.api.slack.triage.trigger(projectId, channelLinkId);
}

export function getSlackPendingItems(projectId: string): Promise<SlackTriageItem[]> {
  return window.api.slack.triage.getPending(projectId);
}

export function getAllSlackTriageItems(projectId: string): Promise<SlackTriageItem[]> {
  return window.api.slack.triage.getAll(projectId);
}

export function countSlackPending(projectId: string): Promise<number> {
  return window.api.slack.triage.countPending(projectId);
}

export function approveSlackItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.slack.triage.approve(itemId);
}

export function editSlackItem(itemId: string, suggestedAction: unknown): Promise<{ success: boolean; error?: string }> {
  return window.api.slack.triage.edit(itemId, suggestedAction);
}

export function dismissSlackItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.slack.triage.dismiss(itemId);
}

export function restoreSlackItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.slack.triage.restore(itemId);
}

export function executeSlackItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.slack.triage.execute(itemId);
}
