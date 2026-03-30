/**
 * Slack Triage Repository Interfaces
 *
 * of actionable items identified by Claude.
 */

import type {
  SlackChannelLink,
  SlackTriageItem,
  SlackTriageActionType,
  SlackTriageStatus,
} from '../../../shared/types';

// ============================================================================
// Channel Link Repository
// ============================================================================

export interface SlackChannelLinkCreate {
  project_id: string;
  channel_id: string;
  channel_name: string;
}

export interface ISlackChannelLinkRepository {
  getByProject(projectId: string): SlackChannelLink[];
  get(id: string): SlackChannelLink | undefined;
  getByChannelId(projectId: string, channelId: string): SlackChannelLink | undefined;
  create(link: SlackChannelLinkCreate): SlackChannelLink;
  updateLastCheckedTs(id: string, ts: string): void;
  delete(id: string): void;
}

// ============================================================================
// Triage Item Repository
// ============================================================================

export interface SlackTriageItemCreate {
  channel_link_id: string;
  source_messages: string[];
  thread_ts: string | null;
  latest_reply_ts: string | null;
  author_name: string;
  source_text: string;
  topic_summary: string;
  action_type: SlackTriageActionType;
  suggested_action: unknown;
  context_used: string[] | null;
}

export interface ISlackTriageItemRepository {
  getByProject(projectId: string): SlackTriageItem[];
  getPending(projectId: string): SlackTriageItem[];
  get(id: string): SlackTriageItem | undefined;
  getExistingMessageTs(channelLinkId: string, statuses: SlackTriageStatus[]): Set<string>;
  getDismissedForThread(channelLinkId: string, threadTs: string): SlackTriageItem[];
  createBatch(items: SlackTriageItemCreate[]): SlackTriageItem[];
  updateStatus(id: string, status: SlackTriageStatus): void;
  updateSuggestedAction(id: string, suggestedAction: unknown): void;
  countPending(projectId: string): number;
}
