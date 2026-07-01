/**
 * Slack Triage Adapter
 *
 * Provides MCP-backed implementations of the Slack I/O dependencies that
 * SlackTriageService requires. Encapsulates all Slack block/JSON parsing,
 * the Claude Agent SDK adapter session, and the plan-item mutation helpers.
 *
 * This module is a pure composition helper — it owns no state and returns a
 * plain object of callbacks that appServices.ts passes straight through to
 * createSlackTriageService().
 */

import { randomUUID } from 'crypto';
import { query, type Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import type { McpDiscoveryService, SlackMcpAvailability } from './McpDiscoveryService';
import type { QueueTrackerUpdateIfNeeded } from '../../db/domain';
import type { SlackTriageCreateTaskAction, SlackTriageUpdateDocumentAction, PlanItem } from '../../../shared/types';
import type { SlackMessage } from './SlackTriageService';
import { unwrapOrThrow } from '../result';
import { getConfig } from '../../config';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';

// =============================================================================
// Deps type
// =============================================================================

export interface SlackTriageAdapterDeps {
  projects: IProjectRepository;
  planItems: IPlanItemRepository;
  mcpDiscoveryService: McpDiscoveryService;
  queueTrackerUpdate: QueueTrackerUpdateIfNeeded;
  /** Optional centralized Claude usage tracker. */
  recordUsage?: (event: {
    projectId: string | null;
    source: 'slack_triage_adapter';
    model: string;
    usage: {
      input_tokens?: number | null;
      output_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
    totalCostUsd?: number | null;
  }) => void;
}

// =============================================================================
// Internal helpers
// =============================================================================

const resolvedSlackChannelSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const stripJsonFences = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
};

const normalizeSlackToolToken = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const isSlackAdapterTool = (toolName: string, availability: SlackMcpAvailability): boolean => {
  if (!toolName.startsWith('mcp__')) return false;

  const normalizedToolName = normalizeSlackToolToken(toolName);
  if (normalizedToolName.includes('slack')) return true;

  const normalizedServerName = normalizeSlackToolToken(availability.serverName ?? '');
  return normalizedServerName.length > 0 && normalizedToolName.includes(normalizedServerName);
};

const explainSlackAdapterFailure = (response: string): string | null => {
  const normalized = response.trim().toLowerCase();
  if (
    normalized.includes("don't currently have any slack tools available")
    || normalized.includes('do not currently have any slack tools available')
    || normalized.includes('slack mcp tools do not appear to be loaded or connected')
    || normalized.includes('slack tools available in my toolset')
  ) {
    return 'Slack MCP tools were not available in the triage adapter session. Check that Slack is connected in Claude and enabled for KPM.';
  }

  return null;
};

const extractJsonPayload = (text: string): string | null => {
  const trimmed = stripJsonFences(text).trim();
  if (!trimmed) return null;

  const tryParseCandidate = (candidate: string): string | null => {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  };

  const wholeDocument = tryParseCandidate(trimmed);
  if (wholeDocument) return wholeDocument;

  for (let i = 0; i < trimmed.length; i += 1) {
    const start = trimmed[i];
    if (start !== '{' && start !== '[') continue;

    const stack: string[] = [start === '{' ? '}' : ']'];
    let inString = false;
    let escaped = false;

    for (let j = i + 1; j < trimmed.length; j += 1) {
      const char = trimmed[j];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        stack.push('}');
        continue;
      }
      if (char === '[') {
        stack.push(']');
        continue;
      }

      const expected = stack[stack.length - 1];
      if ((char === '}' || char === ']') && char === expected) {
        stack.pop();
        if (stack.length === 0) {
          const candidate = trimmed.slice(i, j + 1);
          const parsedCandidate = tryParseCandidate(candidate);
          if (parsedCandidate) {
            return parsedCandidate;
          }
        }
      }
    }
  }

  return null;
};

// =============================================================================
// Adapter factory
// =============================================================================

export function createSlackTriageAdapter(deps: SlackTriageAdapterDeps) {
  const { projects, planItems, mcpDiscoveryService, queueTrackerUpdate } = deps;

  // ──────────────────────────────────────────────────────────────────────────
  // MCP adapter session runner
  // ──────────────────────────────────────────────────────────────────────────

  const runSlackAdapterPrompt = async ({
    projectId,
    systemPrompt,
    userPrompt,
    timeoutMs = 90_000,
  }: {
    projectId?: string;
    systemPrompt: string;
    userPrompt: string;
    timeoutMs?: number;
  }): Promise<{ text: string; usedSlackTool: boolean }> => {
    const availability = unwrapOrThrow(await mcpDiscoveryService.getSlackAvailability());
    if (!availability.available) {
      throw new Error(availability.reason ?? 'Slack MCP is not available');
    }

    const projectFolder = projectId
      ? projects.get(projectId)?.folder_path ?? process.cwd()
      : process.cwd();

    // Gather MCP server configs so the adapter session has access to Slack tools
    const pluginPathsResult = mcpDiscoveryService.getEnabledPluginPaths();
    const enabledPluginPaths = pluginPathsResult.ok ? pluginPathsResult.data : [];
    const userConfigsResult = mcpDiscoveryService.getEnabledUserMcpConfigs();
    const enabledUserMcpConfigs = userConfigsResult.ok ? userConfigsResult.data : {};

    const abortController = new AbortController();
    const sdkOptions: SDKOptions = {
      model: getConfig().generation.fastModel,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: systemPrompt,
      },
      cwd: projectFolder,
      maxTurns: 15,
      tools: [],
      persistSession: false,
      settingSources: ['user'],
      abortController,
      // Always pass mcpServers (even if empty) so the SDK initializes the MCP
      // subsystem — this ensures managed servers (like claude.ai Slack) are loaded.
      mcpServers: enabledUserMcpConfigs as SDKOptions['mcpServers'],
      ...(enabledPluginPaths.length > 0 && {
        plugins: enabledPluginPaths.map(p => ({ type: 'local' as const, path: p })),
      }),
      // Slack triage is a deliberate feature action, so allow only Slack MCP calls
      // inside this isolated adapter session and deny everything else.
      canUseTool: (toolName, input) => Promise.resolve(
        isSlackAdapterTool(toolName, availability)
          ? { behavior: 'allow' as const, updatedInput: input }
          : {
              behavior: 'deny' as const,
              message: 'Slack triage may only use Slack MCP tools in this adapter session.',
            }
      ),
      skills: [],
      env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'kpm' },
      ...getClaudeSdkSpawnOptions(),
    };

    const queryGenerator = query({ prompt: userPrompt, options: sdkOptions });
    const sdkModel = getConfig().generation.fastModel;
    let finalText = '';
    let usedSlackTool = false;

    const generatePromise = (async () => {
      for await (const message of queryGenerator) {
        if (message.type === 'tool_progress' && isSlackAdapterTool(message.tool_name, availability)) {
          usedSlackTool = true;
        }
        if (message.type === 'tool_use_summary' && message.summary.toLowerCase().includes('slack')) {
          usedSlackTool = true;
        }

        if (message.type === 'result' && deps.recordUsage) {
          const resultMsg = message as {
            usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
            total_cost_usd?: number | null;
          };
          if (resultMsg.usage) {
            deps.recordUsage({
              projectId: projectId ?? null,
              source: 'slack_triage_adapter',
              model: sdkModel,
              usage: resultMsg.usage,
              totalCostUsd: resultMsg.total_cost_usd ?? null,
            });
          }
        }

        const content = message.type === 'assistant'
          ? message.message.content
          : message.type === 'result'
            ? (message as { message?: { content?: { type: string; text?: string }[] } }).message?.content
            : undefined;
        if (!content) continue;

        let messageText = '';
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            messageText += block.text;
          }
        }
        if (messageText.trim()) {
          finalText = messageText;
        }
      }
      return { text: finalText, usedSlackTool };
    })();

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error(`Slack MCP call timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([generatePromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  const parseSlackJson = <T,>(response: string, options?: { usedSlackTool?: boolean }): T => {
    const cleaned = stripJsonFences(response);
    if (!cleaned) {
      throw new Error('Slack adapter returned empty response — the model may not have produced text output after tool use');
    }
    if (cleaned === '[]' && options?.usedSlackTool === false) {
      throw new Error('Slack adapter returned an empty result without using a Slack tool. Check that Slack is connected in Claude and enabled for KPM.');
    }

    const jsonPayload = extractJsonPayload(cleaned);
    if (!jsonPayload) {
      const adapterFailure = explainSlackAdapterFailure(cleaned);
      if (adapterFailure) {
        throw new Error(adapterFailure);
      }
      throw new Error(`Slack adapter returned invalid JSON: ${cleaned.slice(0, 200)}`);
    }

    try {
      return JSON.parse(jsonPayload) as T;
    } catch (cause) {
      const adapterFailure = explainSlackAdapterFailure(cleaned);
      if (adapterFailure) {
        throw new Error(adapterFailure, { cause });
      }
      throw new Error(`Slack adapter returned invalid JSON: ${cleaned.slice(0, 200)}`, { cause });
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Channel resolution
  // ──────────────────────────────────────────────────────────────────────────

  const resolveSlackChannel = async (
    projectId: string,
    channelReference: string
  ): Promise<{ id: string; name: string } | null> => {
    console.log('[SlackTriage] Resolving channel reference', {
      projectId,
      channelReference,
    });

    const { text: response, usedSlackTool } = await runSlackAdapterPrompt({
      projectId,
      systemPrompt: `You are a Slack MCP adapter for KPM.

Use Slack tools to resolve a Slack channel reference to an exact channel.
The reference may be a Slack channel ID like C123ABC456 or a human-readable channel name like team-project-updates.
When calling slack_search_channels, pass channel_types: "public_channel,private_channel" so private channels the user belongs to are included — defaulting to public-only causes valid private channels to resolve as null.
Return only JSON in one of these forms:
- {"id":"C123ABC456","name":"team-project-updates"}
- null`,
      userPrompt: `Resolve this Slack channel reference: ${JSON.stringify(channelReference)}.

Return only JSON.`,
    });

    const rawResolvedChannel = parseSlackJson<unknown>(response, { usedSlackTool });
    if (rawResolvedChannel === null) {
      console.log('[SlackTriage] Resolved channel reference', {
        projectId,
        channelReference,
        resolvedChannelId: null,
        resolvedChannelName: null,
      });
      return null;
    }

    const parsedChannel = resolvedSlackChannelSchema.safeParse(rawResolvedChannel);
    if (!parsedChannel.success) {
      throw new Error('Slack adapter returned an invalid channel reference payload');
    }

    const resolvedChannel = parsedChannel.data;
    console.log('[SlackTriage] Resolved channel reference', {
      projectId,
      channelReference,
      resolvedChannelId: resolvedChannel?.id ?? null,
      resolvedChannelName: resolvedChannel?.name ?? null,
    });
    return resolvedChannel;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Channel / thread reads and message sends
  // ──────────────────────────────────────────────────────────────────────────

  const readSlackChannel = async (projectId: string, channelId: string, oldest?: string): Promise<SlackMessage[]> => {
    const resolvedChannel = await resolveSlackChannel(projectId, channelId);
    if (!resolvedChannel) {
      throw new Error(`Slack channel not found: ${channelId}`);
    }

    console.log('[SlackTriage] Reading channel history', {
      projectId,
      savedChannelReference: channelId,
      resolvedChannelId: resolvedChannel.id,
      resolvedChannelName: resolvedChannel.name,
      oldest: oldest ?? null,
    });

    const { text: response, usedSlackTool } = await runSlackAdapterPrompt({
      projectId,
      systemPrompt: `You are a Slack MCP adapter for KPM.

Use Slack tools to read channel history.
Call slack_read_channel exactly once with limit: 100. Do not paginate — ignore any next_cursor in the response.
Return only a JSON array of messages. Preserve these fields when present:
- ts: string
- user: string
- text: string
- thread_ts: string
- subtype: string
- bot_id: string
- reply_count: number
- latest_reply: string`,
      userPrompt: `Read Slack channel ${JSON.stringify(resolvedChannel.id)} (${JSON.stringify(resolvedChannel.name)})${oldest ? ` starting after timestamp ${JSON.stringify(oldest)}` : ''}.

Return only JSON.`,
    });

    const messages = parseSlackJson<SlackMessage[]>(response, { usedSlackTool });
    console.log('[SlackTriage] Channel history result', {
      projectId,
      resolvedChannelId: resolvedChannel.id,
      resolvedChannelName: resolvedChannel.name,
      oldest: oldest ?? null,
      messageCount: messages.length,
      firstMessageTs: messages[0]?.ts ?? null,
      lastMessageTs: messages.length > 0 ? messages[messages.length - 1]?.ts ?? null : null,
    });
    return messages;
  };

  const readSlackThread = async (projectId: string, channelId: string, threadTs: string): Promise<SlackMessage[]> => {
    const resolvedChannel = await resolveSlackChannel(projectId, channelId);
    if (!resolvedChannel) {
      throw new Error(`Slack channel not found: ${channelId}`);
    }

    console.log('[SlackTriage] Reading thread', {
      projectId,
      savedChannelReference: channelId,
      resolvedChannelId: resolvedChannel.id,
      resolvedChannelName: resolvedChannel.name,
      threadTs,
    });

    const { text: response, usedSlackTool } = await runSlackAdapterPrompt({
      projectId,
      systemPrompt: `You are a Slack MCP adapter for KPM.

Use Slack tools to read a thread.
Call slack_read_thread exactly once with limit: 100. Do not paginate — ignore any next_cursor in the response.
Return only a JSON array of reply messages. Exclude the root message whose ts matches the thread ts.
Preserve these fields when present:
- ts: string
- user: string
- text: string
- thread_ts: string
- subtype: string
- bot_id: string
- reply_count: number`,
      userPrompt: `Read the Slack thread in channel ${JSON.stringify(resolvedChannel.id)} (${JSON.stringify(resolvedChannel.name)}) with parent thread ts ${JSON.stringify(threadTs)}.

Return only JSON replies, excluding the root message.`,
    });

    const replies = parseSlackJson<SlackMessage[]>(response, { usedSlackTool });
    console.log('[SlackTriage] Thread result', {
      projectId,
      resolvedChannelId: resolvedChannel.id,
      resolvedChannelName: resolvedChannel.name,
      threadTs,
      replyCount: replies.length,
    });
    return replies;
  };

  const sendSlackMessage = async (projectId: string, channelId: string, text: string, threadTs?: string): Promise<void> => {
    const resolvedChannel = await resolveSlackChannel(projectId, channelId);
    if (!resolvedChannel) {
      throw new Error(`Slack channel not found: ${channelId}`);
    }

    console.log('[SlackTriage] Sending message', {
      projectId,
      savedChannelReference: channelId,
      resolvedChannelId: resolvedChannel.id,
      resolvedChannelName: resolvedChannel.name,
      threadTs: threadTs ?? null,
      textLength: text.length,
    });

    await runSlackAdapterPrompt({
      projectId,
      systemPrompt: `You are a Slack MCP adapter for KPM.

Use Slack tools to send the exact message provided by the user.
Do not rewrite, summarize, or format the message differently.
Return only JSON: {"ok": true} once the message has been sent.`,
      userPrompt: `Send this exact Slack message to channel ${JSON.stringify(resolvedChannel.id)} (${JSON.stringify(resolvedChannel.name)})${threadTs ? ` in thread ${JSON.stringify(threadTs)}` : ''}.

Message:
${text}

Return only {"ok": true}.`,
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Plan-item mutation helpers (used by createTaskFromTriage / applyDocumentUpdate)
  // ──────────────────────────────────────────────────────────────────────────

  const resolvePlanItemTarget = (projectId: string, target: string): PlanItem | null => {
    const items = planItems.getByProject(projectId);
    const normalizedTarget = target.trim().toLowerCase();

    return items.find((item) => item.id === target)
      ?? items.find((item) => item.title === target)
      ?? items.find((item) => item.title.trim().toLowerCase() === normalizedTarget)
      ?? null;
  };

  const appendToDescription = (existing: string | null | undefined, content: string): string => {
    const current = existing?.trim() ?? '';
    if (!current) return content;
    if (current.includes(content.trim())) return current;
    return `${current}\n\n${content}`;
  };

  const parseStatusCategory = (value: string): PlanItem['status_category'] | null => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'not_started') return 'not_started';
    if (normalized === 'in_progress') return 'in_progress';
    if (normalized === 'in_review') return 'in_review';
    if (normalized === 'done') return 'done';
    if (normalized === 'blocked') return 'blocked';
    if (normalized === 'canceled') return 'canceled';
    return null;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Triage action callbacks
  // ──────────────────────────────────────────────────────────────────────────

  const createTaskFromTriage = (projectId: string, action: SlackTriageCreateTaskAction): void => {
    const parentItem = action.suggested_parent
      ? resolvePlanItemTarget(projectId, action.suggested_parent)
      : null;
    const itemId = randomUUID();

    planItems.add({
      id: itemId,
      project_id: projectId,
      title: action.title,
      description: action.description,
      label: action.labels.find((label) => label.trim().length > 0) ?? 'task',
      status: 'planned',
      status_category: action.suggested_status,
      parent_id: parentItem?.id ?? null,
      group_id: null,
      item_order: planItems.getNextOrder(projectId, parentItem?.id ?? null),
      code_refs: null,
      release_tag: null,
      position_x: null,
      position_y: null,
      association_id: null,
      external_key: null,
      external_id: null,
      external_type: null,
      external_issue_type: null,
      external_status: null,
      external_url: null,
      external_parent_key: null,
      external_epic_key: null,
      sync_source: 'local',
      last_synced_at: null,
      intent: null,
      acceptance_criteria: null,
      source_document_id: null,
    });

    queueTrackerUpdate(
      { id: itemId, project_id: projectId, external_key: null, association_id: null, status_category: null },
      { status_category: action.suggested_status },
      'user'
    );
  };

  const applyDocumentUpdate = (projectId: string, action: SlackTriageUpdateDocumentAction): void => {
    const targetItem = resolvePlanItemTarget(projectId, action.target);
    if (!targetItem) {
      throw new Error(`Slack triage could not find a plan item target matching "${action.target}"`);
    }

    switch (action.update_type) {
      case 'add_note':
      case 'add_reference_link': {
        const nextDescription = appendToDescription(targetItem.description, action.content);
        planItems.update(targetItem.id, { description: nextDescription });
        queueTrackerUpdate(targetItem, { description: nextDescription }, 'user');
        return;
      }
      case 'update_description': {
        planItems.update(targetItem.id, { description: action.content });
        queueTrackerUpdate(targetItem, { description: action.content }, 'user');
        return;
      }
      case 'update_status': {
        const statusCategory = parseStatusCategory(action.content);
        if (!statusCategory) {
          throw new Error(`Slack triage status update must be an explicit status_category, got: ${action.content}`);
        }
        planItems.update(targetItem.id, { status_category: statusCategory });
        queueTrackerUpdate(targetItem, { status_category: statusCategory }, 'user');
        return;
      }
      default:
        throw new Error(`Unsupported document update type: ${String(action.update_type)}`);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Slack availability pass-through
  // ──────────────────────────────────────────────────────────────────────────

  const getSlackAvailability = async (): Promise<SlackMcpAvailability> =>
    unwrapOrThrow(await mcpDiscoveryService.getSlackAvailability());

  // ──────────────────────────────────────────────────────────────────────────
  // Public API (matches SlackTriageServiceDeps minus repository fields)
  // ──────────────────────────────────────────────────────────────────────────

  return {
    resolveSlackChannel,
    readSlackChannel,
    readSlackThread,
    sendSlackMessage,
    createTaskFromTriage,
    applyDocumentUpdate,
    getSlackAvailability,
  };
}

export type SlackTriageAdapter = ReturnType<typeof createSlackTriageAdapter>;
