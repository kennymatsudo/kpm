/**
 * Slack Triage Panel
 *
 * Slide-over from the right showing triage items grouped by action type.
 * Users can approve, edit, dismiss, or execute each item.
 */

import { useEffect, useMemo, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSlackTriageStore } from '../../stores';
import type {
  SlackTriageItem,
  SlackTriageActionType,
  SlackTriageReplyAction,
  SlackTriageCreateTaskAction,
  SlackTriageUpdateDocumentAction,
} from '../../../shared/types';
import { Z_INDEX } from '../../constants/zIndex';

interface SlackTriagePanelProps {
  projectId: string;
}

const ACTION_TYPE_ORDER: SlackTriageActionType[] = ['reply', 'create_task', 'update_document', 'info_only'];
const ACTION_TYPE_LABELS: Record<SlackTriageActionType, string> = {
  reply: 'Reply',
  update_document: 'Update Document',
  info_only: 'Info Only',
};

function isOpaqueSlackUserId(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[UW][A-Z0-9]{8,}$/.test(value.trim());
}

export function SlackTriagePanel({ projectId }: SlackTriagePanelProps) {
  const {
    isPanelOpen,
    pendingItems,
    channelLinks,
    isTriaging,
    error,
  } = useSlackTriageStore(
    useShallow((s) => ({
      isPanelOpen: s.isPanelOpen,
      pendingItems: s.pendingItems,
      channelLinks: s.channelLinks,
      isTriaging: s.isTriaging,
      error: s.error,
    }))
  );
  const setPanelOpen = useSlackTriageStore((s) => s.setPanelOpen);
  const loadPendingItems = useSlackTriageStore((s) => s.loadPendingItems);
  const loadLinks = useSlackTriageStore((s) => s.loadLinks);
  const triggerTriage = useSlackTriageStore((s) => s.triggerTriage);
  const dismissItem = useSlackTriageStore((s) => s.dismissItem);
  const executeItem = useSlackTriageStore((s) => s.executeItem);

  useEffect(() => {
    if (isPanelOpen) {
    }
  }, [isPanelOpen, projectId, loadLinks, loadPendingItems]);

  const grouped = useMemo(() => {
    const groups = new Map<SlackTriageActionType, SlackTriageItem[]>();
    for (const type of ACTION_TYPE_ORDER) {
      const items = pendingItems.filter((i) => i.action_type === type);
      if (items.length > 0) {
        groups.set(type, items);
      }
    }
    return groups;
  }, [pendingItems]);

  const handleTriggerAll = useCallback(async () => {

    let channelsChecked = 0;

    for (const link of channelLinks) {
      const result = await triggerTriage(projectId, link.id);
      if (!result) continue;

      channelsChecked += 1;
    }

    if (channelsChecked > 0) {
    }

  if (!isPanelOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 w-[420px] bg-surface-elevated border-l border-border-strong shadow-xl flex flex-col"
      style={{ zIndex: Z_INDEX.panel }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-2">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <h2 className="text-sm font-semibold text-text-primary truncate">
            Slack Triage
          </h2>
          {pendingItems.length > 0 && (
            <span className="text-xs text-text-muted">
              {pendingItems.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleTriggerAll}
            disabled={isTriaging || channelLinks.length === 0}
            className="btn text-xs px-2 py-1 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {isTriaging ? 'Checking...' : 'Check Channels'}
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            className="p-1 text-text-muted hover:text-text-primary rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-danger/10 text-danger text-xs border-b border-border-default">
          {error}
        </div>
      )}

      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        ) : (
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-text-muted text-sm px-6 text-center">
      {message}
    </div>
  );
}

function TriageGroup({
  actionType,
  items,
  projectId,
  onDismiss,
  onExecute,
}: {
  actionType: SlackTriageActionType;
  items: SlackTriageItem[];
  projectId: string;
  onDismiss: (id: string, projectId: string) => Promise<void>;
  onExecute: (id: string, projectId: string) => Promise<void>;
}) {
  return (
    <div>
      <h3 className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-2">
        {ACTION_TYPE_LABELS[actionType]}
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <TriageItemCard
            key={item.id}
            item={item}
            projectId={projectId}
            onDismiss={onDismiss}
            onExecute={onExecute}
          />
        ))}
      </div>
    </div>
  );
}

function TriageItemCard({
  item,
  projectId,
  onDismiss,
  onExecute,
}: {
  item: SlackTriageItem;
  projectId: string;
  onDismiss: (id: string, projectId: string) => Promise<void>;
  onExecute: (id: string, projectId: string) => Promise<void>;
}) {
  const [isActing, setIsActing] = useState(false);
  const showAuthor = item.author_name && !isOpaqueSlackUserId(item.author_name);

  const handleAction = async (action: (id: string, pid: string) => Promise<void>) => {
    setIsActing(true);
    try {
      await action(item.id, projectId);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="rounded-lg border border-border-default bg-surface-1 p-3">
      <div className="flex items-start gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xxs uppercase tracking-wider text-text-muted">Topic</p>
          <p className="text-xs font-medium text-text-primary">{item.topic_summary}</p>
          {showAuthor && (
            <p className="text-xxs text-text-muted mt-0.5">{item.author_name}</p>
          )}
        </div>
        {item.context_used && item.context_used.length > 0 && (
          <span className="text-xxs text-text-muted ml-auto">
            Based on: {(item.context_used as string[]).join(', ')}
          </span>
        )}
      </div>

      <div className="mb-2">
        <p className="text-xxs uppercase tracking-wider text-text-muted">Slack Excerpt</p>
        <p className="text-xs text-text-secondary mt-0.5 line-clamp-3">
          {showAuthor && (
            <span className="font-medium text-text-primary">{item.author_name}: </span>
          )}
          {item.source_text}
        </p>
      </div>

      {/* Suggested action preview */}
      <SuggestedActionPreview item={item} />

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border-subtle">
        {item.action_type === 'reply' && (
          <ActionButton label="Send" variant="accent" disabled={isActing} onClick={() => handleAction(onExecute)} />
        )}
        {item.action_type === 'create_task' && (
        )}
        {item.action_type === 'update_document' && (
          <ActionButton label="Apply" variant="accent" disabled={isActing} onClick={() => handleAction(onExecute)} />
        )}
        {item.action_type !== 'info_only' && (
          <ActionButton label="Dismiss" variant="muted" disabled={isActing} onClick={() => handleAction(onDismiss)} />
        )}
        {item.action_type === 'info_only' && (
          <ActionButton label="Dismiss" variant="muted" disabled={isActing} onClick={() => handleAction(onDismiss)} />
        )}
      </div>
    </div>
  );
}

function SuggestedActionPreview({ item }: { item: SlackTriageItem }) {
  const action = item.suggested_action as Record<string, unknown> | null;
  if (!action) return null;

  switch (item.action_type) {
    case 'reply': {
      const replyAction = action as unknown as SlackTriageReplyAction;
      return (
        <div className="bg-surface-2 rounded p-2 text-xs text-text-secondary">
          <span className="text-xxs text-text-muted block mb-0.5">Draft reply:</span>
          <p className="line-clamp-3">{replyAction.reply_text}</p>
        </div>
      );
    }
    case 'create_task': {
      const taskAction = action as unknown as SlackTriageCreateTaskAction;
      return (
        <div className="bg-surface-2 rounded p-2 text-xs">
          <p className="font-medium text-text-primary mt-0.5">{taskAction.title}</p>
          <p className="text-text-secondary mt-1 whitespace-pre-wrap line-clamp-4">{taskAction.description}</p>
          {taskAction.suggested_parent && (
            <p className="text-xxs text-text-muted mt-1">Under: {taskAction.suggested_parent}</p>
          )}
        </div>
      );
    }
    case 'update_document': {
      const docAction = action as unknown as SlackTriageUpdateDocumentAction;
      return (
        <div className="bg-surface-2 rounded p-2 text-xs">
          <p className="text-xxs uppercase tracking-wider text-text-muted">Document Update</p>
          <p className="font-medium text-text-primary mt-0.5">{docAction.target}</p>
          <p className="text-xxs text-text-muted mt-1">{docAction.update_type.replace(/_/g, ' ')}</p>
          <p className="text-text-secondary line-clamp-2">{docAction.content}</p>
        </div>
      );
    }
    case 'info_only': {
      const summary = (action as { summary?: string }).summary;
      return summary ? (
        <div className="bg-surface-2 rounded p-2 text-xs text-text-secondary">
          {summary}
        </div>
      ) : null;
    }
    default:
      return null;
  }
}

function ActionButton({
  label,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  variant: 'accent' | 'muted';
  disabled: boolean;
  onClick: () => void;
}) {
  const classes = variant === 'accent'
    ? 'bg-accent/10 text-accent hover:bg-accent/20'
    : 'bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text-secondary';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 ${classes}`}
    >
      {label}
    </button>
  );
}
