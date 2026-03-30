/**
 * Slack Triage Service
 *
 * Manages Slack channel links and the triage pipeline.
 * Uses Claude (Sonnet) to classify messages and draft actions.
 */

import { z } from 'zod';
import type { ISlackChannelLinkRepository, ISlackTriageItemRepository, SlackTriageItemCreate } from '../../db/interfaces/slack';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import type {
  SlackChannelLink,
  SlackTriageCreateTaskAction,
  SlackTriageItem,
  SlackTriageUpdateDocumentAction,
} from '../../../shared/types';
import type { ServiceResult, AsyncResult } from '../result';
import { failure, wrap, wrapAsync } from '../result';
import {
  buildSlackTriagePrompt,
  buildSlackTriageUserMessage,
  type SlackTriagePromptContext,
} from '../../claude/prompts/slackTriage';
import type { SlackMcpAvailability } from './McpDiscoveryService';

// ============================================================================
// Types
// ============================================================================

export interface SlackTriageServiceDeps {
  slackChannelLinks: ISlackChannelLinkRepository;
  slackTriageItems: ISlackTriageItemRepository;
  planItems: IPlanItemRepository;
  readSlackChannel: (projectId: string, channelId: string, oldest?: string) => Promise<SlackMessage[]>;
  readSlackThread: (projectId: string, channelId: string, threadTs: string) => Promise<SlackMessage[]>;
  sendSlackMessage: (projectId: string, channelId: string, text: string, threadTs?: string) => Promise<void>;
  getSlackAvailability: () => Promise<SlackMcpAvailability>;
  createTaskFromTriage: (projectId: string, action: SlackTriageCreateTaskAction) => void | Promise<void>;
  applyDocumentUpdate: (projectId: string, action: SlackTriageUpdateDocumentAction) => void | Promise<void>;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  thread_ts?: string;
  subtype?: string;
  bot_id?: string;
  reply_count?: number;
}

export interface TriageResult {
  newItems: SlackTriageItem[];
  messagesProcessed: number;
  messagesFiltered: number;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const contextUsedSchema = z.enum(['plan_items', 'triaged_topics', 'thread_content', 'source_code']);

const replyActionSchema = z.object({
  reply_text: z.string().min(1),
  thread_ts: z.string().nullable(),
});

const createTaskActionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  suggested_status: z.enum(['not_started', 'in_progress', 'blocked']),
  suggested_parent: z.string().nullable(),
  labels: z.array(z.string()),
});

const updateDocumentActionSchema = z.object({
  target: z.string().min(1),
  update_type: z.enum(['add_note', 'update_status', 'add_reference_link', 'update_description']),
  content: z.string().min(1),
  rationale: z.string().min(1),
});

const triageBaseSchema = z.object({
  source_messages: z.array(z.string().min(1)).min(1),
  thread_ts: z.string().nullable(),
  latest_reply_ts: z.string().nullable(),
  author_name: z.string().min(1),
  source_text: z.string().min(1),
  topic_summary: z.string().min(1),
  context_used: z.array(contextUsedSchema).optional(),
});

const triageResponseSchema = z.array(z.discriminatedUnion('action_type', [
  triageBaseSchema.extend({
    action_type: z.literal('reply'),
    suggested_action: replyActionSchema,
  }),
  triageBaseSchema.extend({
    action_type: z.literal('create_task'),
    suggested_action: createTaskActionSchema,
  }),
  triageBaseSchema.extend({
    action_type: z.literal('update_document'),
    suggested_action: updateDocumentActionSchema,
  }),
  triageBaseSchema.extend({
    action_type: z.literal('info_only'),
    summary: z.string().min(1),
  }),
]));

type ParsedTriageItem = z.infer<typeof triageResponseSchema>[number];

// ============================================================================
// Service Factory
// ============================================================================

export function createSlackTriageService(deps: SlackTriageServiceDeps) {
  // ──────────────────────────────────────────────────────────────────────────
  // Feature Availability
  // ──────────────────────────────────────────────────────────────────────────

  async function getAvailability(): AsyncResult<SlackMcpAvailability> {
    return wrapAsync(() => deps.getSlackAvailability(), 'Failed to detect Slack MCP');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Channel Link CRUD
  // ──────────────────────────────────────────────────────────────────────────

  function listLinks(projectId: string): SlackChannelLink[] {
    return deps.slackChannelLinks.getByProject(projectId);
  }

    projectId: string,
    channelId: string,
    channelName: string
  }

  function deleteLink(linkId: string): ServiceResult<void> {
    const link = deps.slackChannelLinks.get(linkId);
    if (!link) return failure(`Channel link not found: ${linkId}`);
    return wrap(() => deps.slackChannelLinks.delete(linkId));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Triage Pipeline
  // ──────────────────────────────────────────────────────────────────────────

  async function triggerTriage(
    projectId: string,
    channelLinkId: string
  ): AsyncResult<TriageResult> {
    return wrapAsync(async () => {
      await ensureSlackAvailable();

      const link = deps.slackChannelLinks.get(channelLinkId);
      if (!link) throw new Error(`Channel link not found: ${channelLinkId}`);
      if (link.project_id !== projectId) {
        throw new Error(`Channel link ${channelLinkId} does not belong to project ${projectId}`);
      }

      // Step 0: Fetch messages from Slack

      if (rawMessages.length === 0) {
      }

      // Step 0: Pre-filter (deterministic, no model)
      const existingTs = deps.slackTriageItems.getExistingMessageTs(channelLinkId, ['pending', 'executed']);
        }

      const messagesFiltered = rawMessages.length - filtered.length;

      if (filtered.length === 0) {
        updateWatermark(link, rawMessages);
      }

      const threads = new Map<string, SlackMessage[]>();
      const threadMessages = filtered.filter(m => m.reply_count && m.reply_count > 0);

      const dismissedThreadContext: SlackTriagePromptContext['dismissedThreadContext'] = [];

      for (const msg of threadMessages) {
        const replies = await deps.readSlackThread(projectId, link.channel_id, msg.ts);
        threads.set(msg.ts, replies);

        const dismissed = deps.slackTriageItems.getDismissedForThread(channelLinkId, msg.ts);
        for (const dismissedItem of dismissed) {
          dismissedThreadContext.push({
            thread_ts: msg.ts,
            topic_summary: dismissedItem.topic_summary,
          });
        }
      }

      const planItemsList = deps.planItems.getByProject(projectId);
      const priorTopics = deps.slackTriageItems.getPriorTopics(channelLinkId);

      const promptContext: SlackTriagePromptContext = {
        channelName: link.channel_name,
        planItems: planItemsList.map(i => ({
          title: i.title,
          status: i.status_category ?? 'not_started',
        })),
        priorTopics,
        dismissedThreadContext,
      };

      const systemPrompt = buildSlackTriagePrompt(promptContext);
      const userMessage = buildSlackTriageUserMessage(
        filtered.map(m => ({ ts: m.ts, user: m.user, text: m.text, thread_ts: m.thread_ts })),
        new Map(
          Array.from(threads.entries()).map(([ts, replies]) => [
            ts,
            replies.map(r => ({ ts: r.ts, user: r.user, text: r.text })),
          ])
        )
      );


      const parsed = parseTriageResponse(triageResponse);
      const itemsToCreate: SlackTriageItemCreate[] = parsed.map(item => ({
        channel_link_id: channelLinkId,
        source_messages: item.source_messages,
        thread_ts: item.thread_ts ?? null,
        latest_reply_ts: item.latest_reply_ts ?? null,
        author_name: item.author_name,
        source_text: item.source_text,
        topic_summary: item.topic_summary,
        action_type: item.action_type,
        suggested_action: item.action_type === 'info_only'
          ? { summary: item.summary }
          : item.suggested_action,
        context_used: item.context_used ?? null,
      }));

      const newItems = itemsToCreate.length > 0
        ? deps.slackTriageItems.createBatch(itemsToCreate)
        : [];

      updateWatermark(link, rawMessages);

    }, 'Failed to run triage pipeline');
  }

  function updateWatermark(link: SlackChannelLink, messages: SlackMessage[]): void {
    if (messages.length === 0) return;
    const latestTs = messages.reduce((max, message) => (message.ts > max ? message.ts : max), messages[0].ts);
    deps.slackChannelLinks.updateLastCheckedTs(link.id, latestTs);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Triage Item Actions
  // ──────────────────────────────────────────────────────────────────────────

  function getPending(projectId: string): SlackTriageItem[] {
    return deps.slackTriageItems.getPending(projectId);
  }

  function getAll(projectId: string): SlackTriageItem[] {
    return deps.slackTriageItems.getByProject(projectId);
  }

  function countPending(projectId: string): number {
    return deps.slackTriageItems.countPending(projectId);
  }

  function approveItem(itemId: string): ServiceResult<void> {
    return withItem(itemId, () => {
      deps.slackTriageItems.updateStatus(itemId, 'approved');
    });
  }

  function editItem(itemId: string, suggestedAction: unknown): ServiceResult<void> {
    return withItem(itemId, () => {
      deps.slackTriageItems.updateSuggestedAction(itemId, suggestedAction);
      deps.slackTriageItems.updateStatus(itemId, 'edited');
    });
  }

  function dismissItem(itemId: string): ServiceResult<void> {
    return withItem(itemId, () => {
      deps.slackTriageItems.updateStatus(itemId, 'dismissed');
    });
  }

  async function executeItem(itemId: string): AsyncResult<void> {
    return wrapAsync(async () => {
      await ensureSlackAvailable();

      const itemContext = getItemContext(itemId);
      if (!itemContext.ok) {
        throw new Error(itemContext.error);
      }

      const { item, link } = itemContext.data;

      switch (item.action_type) {
        case 'reply': {
          await deps.sendSlackMessage(link.project_id, link.channel_id, action.reply_text, action.thread_ts ?? undefined);
          break;
        }
        case 'create_task': {
          await deps.createTaskFromTriage(link.project_id, action);
          break;
        }
        case 'update_document': {
          await deps.applyDocumentUpdate(link.project_id, action);
          break;
        }
        case 'info_only':
          break;
        default:
          throw new Error(`Unsupported triage action type: ${String(item.action_type)}`);
      }

      deps.slackTriageItems.updateStatus(itemId, 'executed');
    }, 'Failed to execute triage item');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  async function ensureSlackAvailable(): Promise<void> {
    const availability = await deps.getSlackAvailability();
    if (!availability.available) {
      throw new Error(availability.reason ?? 'Slack MCP is not available');
    }
  }

  function withItem(itemId: string, fn: (item: SlackTriageItem) => void): ServiceResult<void> {
    const item = deps.slackTriageItems.get(itemId);
    if (!item) return failure(`Triage item not found: ${itemId}`);
    return wrap(() => fn(item));
  }

  function getItemContext(itemId: string): ServiceResult<{ item: SlackTriageItem; link: SlackChannelLink }> {
    const item = deps.slackTriageItems.get(itemId);
    if (!item) return failure(`Triage item not found: ${itemId}`);

    const link = deps.slackChannelLinks.get(item.channel_link_id);
    if (!link) return failure(`Channel link not found for triage item: ${itemId}`);

    return { ok: true, data: { item, link } };
  }

  return {
    getAvailability,
    // Channel links
    listLinks,
    createLink,
    deleteLink,
    // Triage pipeline
    triggerTriage,
    // Triage items
    getPending,
    getAll,
    countPending,
    approveItem,
    editItem,
    dismissItem,
    executeItem,
  };
}

export type SlackTriageService = ReturnType<typeof createSlackTriageService>;

// ============================================================================
// Claude API Call
// ============================================================================

  const sdkOptions: SDKOptions = {
    systemPrompt,
    maxTurns: 1,
  };

        }
  });

}

// ============================================================================
// Response Parsing
// ============================================================================

function parseTriageResponse(response: string): ParsedTriageItem[] {
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);
  const result = triageResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid Slack triage response: ${result.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return result.data;
}
