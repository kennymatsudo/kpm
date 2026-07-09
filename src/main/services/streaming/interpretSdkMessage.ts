/**
 * Pure interpretation of a raw SDK chat message: given the message and the
 * session's per-turn view, decide which renderer events the turn produces and
 * apply the per-turn state transitions (segment boundaries, activity maps,
 * accumulated response, follow-up queues).
 *
 * The caller (`StreamingSessionService.handleChatSessionMessage`) owns
 * everything process-bound: the session registry, window lookup, event
 * emission, tool-call logging, and turn finalization. This module never
 * touches the SDK, Electron, or the registry, so the whole 400-line message
 * taxonomy is table-testable with plain objects.
 *
 * Mutates `view` in place (it is the live ManagedSession) and returns the
 * events to emit, in order.
 */

import { randomUUID } from 'crypto';
import type { Activity } from '../../../shared/types';
import { getToolActivity, extractDiffFromToolResult } from '../../claude/activity';
import {
  isApiRetryMessage,
  isRateLimitEvent,
  isToolProgressMessage,
  isInformationalMessage,
  isPartialAssistantMessage,
  isCompactBoundaryMessage,
  isModelRefusalFallbackMessage,
  isModelRefusalNoFallbackMessage,
  describeAssistantError,
  describeModelRefusalNoFallback,
} from '../../claude/sdkTypeGuards';

/** Segment state for tracking message boundaries */
export interface SegmentState {
  currentSegmentId: number;
  hasTextInCurrentSegment: boolean;
  pendingActivities: Activity[];
}

/** The slice of ManagedSession that message interpretation reads and mutates. */
export interface SdkMessageSessionView {
  segmentState: SegmentState;
  /** Maps SDK tool_use id → the Activity emitted for it (diff/progress updates merge by id). */
  toolUseActivities: Map<string, Activity>;
  accumulatedResponse: string;
  /** True once this turn has revealed response text from stream deltas. Complete text blocks then only feed persistence. */
  hasStreamedResponseText: boolean;
  /** True while an interrupt-and-send orchestration is tearing down the old turn. */
  interruptInProgress: boolean;
  pendingFollowUpClientMessageIds: string[];
  acceptedFollowUpClientMessageIds: string[];
  promotedFollowUpClientMessageIds: Set<string>;
  resolvedModel?: string;
  turnErrorSurfaced?: boolean;
}

export type InterpretedChatEvent =
  | { kind: 'chunk'; text: string; segmentId: number; precedingActivities?: Activity[] }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'thinking'; text: string }
  | { kind: 'error'; error: string }
  | { kind: 'queue-cleared'; clientMessageId: string; reason: 'already_sent' }
  | { kind: 'suggestions'; suggestions: string[] }
  | {
      kind: 'tool-call-log';
      toolName: string;
      toolCategory: Activity['type'];
      input: Record<string, unknown>;
      label: string;
      detail?: string;
    }
  | { kind: 'log'; message: string }
  /** A `result` message: the caller runs turn finalization (persistence, usage, banners). */
  | { kind: 'turn-result' };

export interface InterpretSdkMessageOptions {
  /** Config `claude.includePartialMessages`: response text is revealed from stream deltas, complete blocks only accumulate. */
  streamPartialsEnabled: boolean;
  now: number;
}

export function interpretSdkMessage(
  msg: unknown,
  view: SdkMessageSessionView,
  options: InterpretSdkMessageOptions,
): InterpretedChatEvent[] {
  const events: InterpretedChatEvent[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkMsg = msg as any;

  // Partial assistant deltas (includePartialMessages): reveal response text
  // token-by-token instead of one block per turn step. Only the main turn
  // drives the transcript — subagent deltas (parent_tool_use_id set) are
  // ignored here and surface as activity-card detail from the complete
  // subagent message instead. Suppressed during interrupt-and-send so late
  // old-turn tokens can't repopulate the next turn's empty streaming bubble.
  if (isPartialAssistantMessage(sdkMsg)) {
    if (sdkMsg.parent_tool_use_id == null && !view.interruptInProgress) {
      const event = sdkMsg.event;
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const deltaText: string = event.delta.text ?? '';
        if (deltaText) {
          const segState = view.segmentState;
          // Drain activities queued by tool_use blocks since the last text run
          // so they render as a boundary before this segment's first token.
          const precedingActivities = segState.pendingActivities.length > 0
            ? [...segState.pendingActivities]
            : undefined;
          if (precedingActivities) segState.pendingActivities = [];
          view.hasStreamedResponseText = true;
          events.push({
            kind: 'chunk',
            text: deltaText,
            segmentId: segState.currentSegmentId,
            precedingActivities,
          });
        }
      }
    }
    return events;
  }

  // Context-compaction boundary: the SDK summarized earlier conversation to
  // stay under the context limit. Surface a lightweight notice so the user
  // understands why earlier turns may now appear condensed.
  if (isCompactBoundaryMessage(sdkMsg)) {
    const trigger = sdkMsg.compact_metadata?.trigger;
    events.push({
      kind: 'activity',
      activity: {
        id: randomUUID(),
        type: 'other' as const,
        label: 'Context compacted',
        detail: trigger === 'manual'
          ? 'Earlier conversation summarized'
          : 'Earlier conversation summarized to free up context',
      },
    });
    return events;
  }

  // Handle assistant messages (text chunks)
  if (sdkMsg.type === 'assistant') {
    // Subagent messages (e.g. the read-only explorer) arrive with
    // parent_tool_use_id set when forwardSubagentText is on. Their text/
    // thinking must NOT enter the main transcript or persisted response —
    // we surface their progress on the parent activity card instead.
    const isSubagentMessage = sdkMsg.parent_tool_use_id != null;

    // Capture the SDK-resolved model ID (e.g. "claude-opus-4-8") so we can
    // display it accurately in the chat header instead of the short alias.
    // Skip subagent messages — the explorer runs on Sonnet and would mislabel
    // the header.
    if (!isSubagentMessage) {
      const msgModel = (sdkMsg.message as { model?: string } | undefined)?.model;
      if (msgModel) view.resolvedModel = msgModel;
    }

    // An assistant message can carry an `error` category when the turn aborts
    // on an API/model failure (`overloaded`, `server_error`, `billing_error`,
    // …). Without surfacing it the turn just stops silently. Suppressed during
    // interrupt-and-send so a late old-turn error can't leak into the next turn.
    // Subagent errors surface via the Task tool_result, so don't double-band them here.
    if (!isSubagentMessage && typeof sdkMsg.error === 'string' && !view.interruptInProgress) {
      const errorText = describeAssistantError(sdkMsg.error);
      if (errorText) {
        view.turnErrorSurfaced = true;
        events.push({ kind: 'error', error: errorText });
      }
    }

    const content = sdkMsg.message?.content || [];
    const segState = view.segmentState;

    for (const block of content) {
      // Subagent text: roll the latest line onto the parent activity card's
      // detail (merge-by-id) so the user sees live progress, then skip — it
      // must not accumulate into the main response or stream as a chunk.
      if (isSubagentMessage) {
        if (block.type === 'text' && typeof block.text === 'string' && !view.interruptInProgress) {
          const parentId = sdkMsg.parent_tool_use_id as string;
          const parent = view.toolUseActivities.get(parentId);
          const line = block.text.split('\n').map((l: string) => l.trim()).find((l: string) => l.length > 0);
          if (parent && line) {
            const detail = line.length > 100 ? `${line.slice(0, 100)}…` : line;
            const updated: Activity = { ...parent, detail };
            view.toolUseActivities.set(parentId, updated);
            events.push({ kind: 'activity', activity: updated });
          }
        }
        // Subagent thinking/tool_use carry no main-transcript meaning beyond
        // the heartbeat already handled elsewhere — ignore the rest.
        continue;
      }

      if (block.type === 'tool_use') {
        // Tool use after text = new segment boundary
        if (segState.hasTextInCurrentSegment) {
          segState.currentSegmentId++;
          segState.hasTextInCurrentSegment = false;
        }

        // Track tool activity with rich context
        const activity = getToolActivity(block.name, block.input as Record<string, unknown>);
        if (activity) {
          // Queue activity for the next text segment
          segState.pendingActivities.push(activity);
          // Map the SDK tool_use id → activity so we can attach the diff
          // stats from the matching tool_use_result later.
          const toolUseId = (block as { id?: unknown }).id;
          if (typeof toolUseId === 'string') {
            view.toolUseActivities.set(toolUseId, activity);
          }
          // Also send activity for real-time display during streaming —
          // suppress during interrupt-and-send so late old-turn activities
          // can't repopulate the next turn's activity indicator.
          if (!view.interruptInProgress) {
            events.push({ kind: 'activity', activity });
          }
        }

        // Tool call logging (additive - does not affect activity flow). File
        // paths are extracted by the dispatcher inside its logging try/catch
        // so a malformed input can only break logging, never event emission.
        events.push({
          kind: 'tool-call-log',
          toolName: block.name,
          toolCategory: activity?.type ?? 'other',
          input: block.input as Record<string, unknown>,
          label: activity?.label ?? block.name,
          detail: activity?.detail,
        });
      }

      if (block.type === 'thinking' && block.thinking) {
        // Thinking blocks stream Claude's reasoning - send to renderer for display.
        // Suppressed during interrupt-and-send: late old-turn thinking would
        // leak into the next turn's reasoning display.
        if (!view.interruptInProgress) {
          events.push({ kind: 'thinking', text: block.thinking });
        }
      }

      if (block.type === 'text') {
        segState.hasTextInCurrentSegment = true;

        // Accumulate text for persistence (the partial response still gets
        // saved to the DB when the aborted turn's result is processed). This
        // is the authoritative copy regardless of streaming mode.
        view.accumulatedResponse += block.text;

        // If this turn already revealed text token-by-token from
        // `stream_event` deltas, the complete block is a duplicate for display
        // and should only feed accumulation/persistence. Some native providers
        // (pi/codex) normally emit only complete blocks even when the global
        // partial-streaming flag is enabled, so key off actual deltas seen this
        // turn rather than the provider/config alone.
        if (options.streamPartialsEnabled && view.hasStreamedResponseText) {
          continue;
        }

        // Suppress chunk emission for the aborted turn while an
        // interrupt-and-send orchestration is in flight. The renderer has
        // already committed the partial bubble as an interrupted message;
        // forwarding late tokens would repopulate the next turn's empty
        // streaming state and produce a phantom assistant bubble.
        if (!view.interruptInProgress) {
          events.push({
            kind: 'chunk',
            text: block.text,
            segmentId: segState.currentSegmentId,
            precedingActivities: segState.pendingActivities.length > 0 ? [...segState.pendingActivities] : undefined,
          });
        }

        // Clear pending activities after attaching to text
        segState.pendingActivities = [];
      }
    }
  }

  // The SDK echoes every user turn back through onMessage as type:'user'.
  // When a plain user turn arrives (no tool_use_result), it means the SDK
  // has dequeued the message and started processing it. Use this as the
  // authoritative "message left the queue" signal to clear the queued badge
  // in the renderer immediately — earlier than waiting for chat:done.
  if (sdkMsg.type === 'user' && !sdkMsg.tool_use_result && view.pendingFollowUpClientMessageIds.length > 0) {
    const acceptedClientMessageId = view.pendingFollowUpClientMessageIds.shift();
    if (acceptedClientMessageId) {
      const wasPromoted = view.promotedFollowUpClientMessageIds.delete(acceptedClientMessageId);
      if (!wasPromoted) {
        view.acceptedFollowUpClientMessageIds.push(acceptedClientMessageId);
      }
      events.push({ kind: 'queue-cleared', clientMessageId: acceptedClientMessageId, reason: 'already_sent' });
    }
  }

  // Handle tool_use_result on user messages — attach diff stats to the
  // matching activity by tool_use_id and re-emit so the renderer updates
  // the existing card instead of pushing a new one.
  // Suppress during interrupt-and-send so late old-turn results can't
  // leak into the next turn's activity stream.
  if (sdkMsg.type === 'user' && sdkMsg.tool_use_result && !view.interruptInProgress) {
    const content = sdkMsg.message?.content;
    const blocks = Array.isArray(content) ? content : [];
    for (const block of blocks) {
      if (block?.type !== 'tool_result') continue;
      const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : null;
      if (!toolUseId) continue;
      const original = view.toolUseActivities.get(toolUseId);
      if (!original) continue;

      const diff = extractDiffFromToolResult(sdkMsg.tool_use_result);
      if (!diff) continue;

      const updated: Activity = {
        ...original,
        diffStats: { additions: diff.additions, deletions: diff.deletions },
        diffHunks: diff.hunks.length > 0 ? diff.hunks : undefined,
      };
      view.toolUseActivities.set(toolUseId, updated);
      events.push({ kind: 'activity', activity: updated });
    }
  }

  // Handle tool-progress heartbeats — the SDK emits these for a still-running
  // tool. Attach the elapsed seconds to the matching activity by tool_use_id
  // and re-emit so the renderer shows a live timer on long calls (e.g. a
  // wide Grep or a slow Bash) instead of a frozen pulse. Merge-by-id on the
  // renderer means this updates the existing card rather than pushing a new
  // one — same mechanism as the diff-stats re-emit above.
  if (isToolProgressMessage(sdkMsg) && !view.interruptInProgress) {
    const original = view.toolUseActivities.get(sdkMsg.tool_use_id);
    // Only surface once a tool has run long enough to be worth a timer —
    // fast tools never get a distracting "0s/1s" flash.
    if (original && sdkMsg.elapsed_time_seconds >= 2) {
      const updated: Activity = {
        ...original,
        elapsedSeconds: Math.round(sdkMsg.elapsed_time_seconds),
      };
      view.toolUseActivities.set(sdkMsg.tool_use_id, updated);
      events.push({ kind: 'activity', activity: updated });
    }
  }

  // Handle informational banners — the SDK emits these for non-error status
  // lines, hook feedback (e.g. a UserPromptSubmit/Stop hook's block reason),
  // and slash-command output. Without surfacing them this feedback is dropped
  // silently. Suppressed during interrupt-and-send so a late old-turn banner
  // can't leak into the next turn.
  if (isInformationalMessage(sdkMsg) && !view.interruptInProgress) {
    const content = (sdkMsg.content ?? '').trim();
    if (content) {
      if (sdkMsg.prevent_continuation) {
        // A hook denied continuation — the turn stops after this message.
        // Surface the reason prominently and mark the turn as already
        // explained so the generic terminal-reason banner is suppressed.
        view.turnErrorSurfaced = true;
        events.push({ kind: 'error', error: content });
      } else if (sdkMsg.level !== 'info') {
        // 'info' is transcript-only per the SDK; surface notice/suggestion/
        // warning as a lightweight activity (same channel as api_retry below).
        const label = sdkMsg.level === 'warning' ? 'Warning'
          : sdkMsg.level === 'suggestion' ? 'Suggestion'
          : 'Notice';
        events.push({
          kind: 'activity',
          activity: { id: randomUUID(), type: 'other' as const, label, detail: content },
        });
      }
    }
  }

  // Handle model-refusal messages: the model declined the request on safety
  // grounds. Two variants from the SDK:
  //  - fallback: the SDK switched to a fallback model and the turn CONTINUES,
  //    so surface a lightweight notice (don't mark the turn errored). This
  //    also explains the model-badge swap (e.g. opus → sonnet) to the user.
  //  - no-fallback: the turn ENDS with no assistant text. Without surfacing
  //    it the turn dies silently. Show the explanation and mark the turn
  //    already-explained so the generic terminal-reason banner is suppressed.
  // Suppressed during interrupt-and-send so a late old-turn refusal can't leak
  // into the next turn.
  if (isModelRefusalFallbackMessage(sdkMsg) && !view.interruptInProgress) {
    events.push({
      kind: 'activity',
      activity: {
        id: randomUUID(),
        type: 'other' as const,
        label: 'Switched models',
        detail: `${sdkMsg.original_model} declined this request — continuing on ${sdkMsg.fallback_model}`,
      },
    });
  }

  if (isModelRefusalNoFallbackMessage(sdkMsg) && !view.interruptInProgress) {
    view.turnErrorSurfaced = true;
    events.push({ kind: 'error', error: describeModelRefusalNoFallback(sdkMsg) });
  }

  // Handle API retry messages — surface to UI as activity
  if (isApiRetryMessage(sdkMsg)) {
    const delaySec = Math.round(sdkMsg.retry_delay_ms / 1000);
    const statusText = sdkMsg.error_status ? `HTTP ${sdkMsg.error_status}` : 'connection error';
    events.push({ kind: 'log', message: `API retry ${sdkMsg.attempt}/${sdkMsg.max_retries} (${statusText}, retry in ${delaySec}s)` });
    events.push({
      kind: 'activity',
      activity: {
        id: randomUUID(),
        type: 'other' as const,
        label: 'Retrying',
        detail: `API ${statusText} — retrying in ${delaySec}s (attempt ${sdkMsg.attempt}/${sdkMsg.max_retries})`,
      },
    });
  }

  // Handle rate limit events — surface warnings/rejections to UI
  if (isRateLimitEvent(sdkMsg)) {
    // errorCode / canUserPurchaseCredits shipped in SDK v0.3.179; the installed
    // type declarations lag behind, so widen structurally.
    const info = sdkMsg.rate_limit_info as typeof sdkMsg.rate_limit_info & {
      errorCode?: string;
      canUserPurchaseCredits?: boolean;
    };
    // Credit exhaustion (claude.ai subscription) is a distinct rejection from a
    // time-based rate limit: credits don't reset on a timer, so "resets in Xm"
    // would be misleading. The SDK flags it via errorCode (v0.3.179+).
    const outOfCredits = info.errorCode === 'credits_required';
    if (info.status === 'allowed_warning' || info.status === 'rejected') {
      const resetsIn = info.resetsAt ? Math.round((info.resetsAt - options.now) / 60_000) : undefined;
      const detail = outOfCredits
        ? `Out of credits${info.canUserPurchaseCredits ? ' — purchase more in your Claude account to continue' : ''}`
        : info.status === 'rejected'
          ? `Rate limited${resetsIn ? ` — resets in ${resetsIn}m` : ''}`
          : `Approaching rate limit${info.utilization ? ` (${Math.round(info.utilization * 100)}% used)` : ''}`;
      events.push({ kind: 'log', message: `Rate limit ${info.status}${outOfCredits ? ' (credits_required)' : ''}: ${detail}` });
      events.push({
        kind: 'activity',
        activity: {
          id: randomUUID(),
          type: 'other' as const,
          label: outOfCredits ? 'Out of Credits' : info.status === 'rejected' ? 'Rate Limited' : 'Rate Limit Warning',
          detail,
        },
      });
    }
  }

  // Result message (final stats): the caller finalizes the turn.
  if (sdkMsg.type === 'result') {
    events.push({ kind: 'turn-result' });
  }

  // Handle prompt suggestion (arrives after result message)
  if (sdkMsg.type === 'prompt_suggestion' && sdkMsg.suggestion) {
    events.push({ kind: 'suggestions', suggestions: [sdkMsg.suggestion] });
  }

  return events;
}
