/**
 * Slack Triage Panel
 *
 * Slide-over from the right showing triage items grouped by action type.
 * Users can approve, edit, dismiss, or execute each item.
 * History tab shows dismissed/executed items with restore capability.
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
    historyItems,
    channelLinks,
    isTriaging,
    activeTab,
    lastTriageResult,
    error,
  } = useSlackTriageStore(
    useShallow((s) => ({
      isPanelOpen: s.isPanelOpen,
      pendingItems: s.pendingItems,
      historyItems: s.historyItems,
      channelLinks: s.channelLinks,
      isTriaging: s.isTriaging,
      activeTab: s.activeTab,
      lastTriageResult: s.lastTriageResult,
      error: s.error,
    }))
  );
  const setPanelOpen = useSlackTriageStore((s) => s.setPanelOpen);
  const setActiveTab = useSlackTriageStore((s) => s.setActiveTab);
  const setLastTriageResult = useSlackTriageStore((s) => s.setLastTriageResult);
  const loadPendingItems = useSlackTriageStore((s) => s.loadPendingItems);
  const loadHistoryItems = useSlackTriageStore((s) => s.loadHistoryItems);
  const loadLinks = useSlackTriageStore((s) => s.loadLinks);
  const triggerTriage = useSlackTriageStore((s) => s.triggerTriage);
  const dismissItem = useSlackTriageStore((s) => s.dismissItem);
  const executeItem = useSlackTriageStore((s) => s.executeItem);
  const restoreItem = useSlackTriageStore((s) => s.restoreItem);

  useEffect(() => {
    if (isPanelOpen) {
      void loadLinks(projectId);
      void loadPendingItems(projectId);
    }
  }, [isPanelOpen, projectId, loadLinks, loadPendingItems]);

  useEffect(() => {
    if (isPanelOpen && activeTab === 'history') {
      void loadHistoryItems(projectId);
    }
  }, [isPanelOpen, activeTab, projectId, loadHistoryItems]);

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
    setLastTriageResult(null);

    let channelsChecked = 0;
    let totalRead = 0;
    let totalProcessed = 0;
    let totalFiltered = 0;
    let totalNew = 0;
    const breakdown = { bot_message: 0, already_triaged: 0, structural: 0 };

    for (const link of channelLinks) {
      const result = await triggerTriage(projectId, link.id);
      if (!result) continue;

      channelsChecked += 1;
      totalRead += result.messagesRead;
      totalProcessed += result.messagesProcessed;
      totalFiltered += result.messagesFiltered;
      totalNew += result.newItems.length;
      breakdown.bot_message += result.filterBreakdown.bot_message;
      breakdown.already_triaged += result.filterBreakdown.already_triaged;
      breakdown.structural += result.filterBreakdown.structural;
    }

    if (channelsChecked > 0) {
      setLastTriageResult({
        messagesRead: totalRead,
        messagesProcessed: totalProcessed,
        messagesFiltered: totalFiltered,
        filterBreakdown: breakdown,
        newItemsCount: totalNew,
        channelsChecked,
      });
    }
  }, [channelLinks, projectId, triggerTriage, setLastTriageResult]);

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

      {/* Triage summary */}
      {lastTriageResult && !error && (
        <TriageSummaryBar result={lastTriageResult} />
      )}

      {/* Tab toggle */}
      <div className="px-4 py-2 border-b border-border-default">
        <div className="flex items-center rounded-md bg-surface-1 border border-border-subtle p-0.5">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 px-2.5 py-1 rounded text-xxs font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Pending{pendingItems.length > 0 ? ` (${pendingItems.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-2.5 py-1 rounded text-xxs font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-surface-3 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            History{historyItems.length > 0 ? ` (${historyItems.length})` : ''}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'pending' ? (
          channelLinks.length === 0 ? (
            <EmptyState message="No Slack channels linked. Add channels in Settings -> Integrations." />
          ) : pendingItems.length === 0 ? (
            <EmptyState message={isTriaging ? 'Analyzing messages...' : 'No pending triage items. Click "Check Channels" to scan for new messages.'} />
          ) : (
            <div className="p-3 space-y-4">
              {ACTION_TYPE_ORDER.map((type) => {
                const items = grouped.get(type);
                if (!items) return null;
                return (
                  <TriageGroup
                    key={type}
                    actionType={type}
                    items={items}
                    projectId={projectId}
                    onDismiss={dismissItem}
                    onExecute={executeItem}
                  />
                );
              })}
            </div>
          )
        ) : (
          historyItems.length === 0 ? (
            <EmptyState message="No history yet. Dismissed and completed items will appear here." />
          ) : (
            <HistoryView items={historyItems} projectId={projectId} onRestore={restoreItem} />
          )
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function TriageSummaryBar({ result }: { result: { messagesRead: number; messagesProcessed: number; messagesFiltered: number; filterBreakdown: { bot_message: number; already_triaged: number; structural: number }; newItemsCount: number; channelsChecked: number } }) {
  const filterParts: string[] = [];
  if (result.filterBreakdown.bot_message > 0) filterParts.push(`${result.filterBreakdown.bot_message} bot`);
  if (result.filterBreakdown.already_triaged > 0) filterParts.push(`${result.filterBreakdown.already_triaged} seen`);
  if (result.filterBreakdown.structural > 0) filterParts.push(`${result.filterBreakdown.structural} system`);

  return (
    <div className="px-4 py-2 bg-surface-2 text-xxs text-text-secondary border-b border-border-default flex flex-wrap items-center gap-x-1.5">
      <span>{result.messagesRead} read</span>
      {filterParts.length > 0 && (
        <>
          <span className="text-text-muted">&middot;</span>
          <span className="text-text-muted">{filterParts.join(', ')}</span>
        </>
      )}
      <span className="text-text-muted">&middot;</span>
      <span>{result.messagesProcessed} analyzed</span>
      <span className="text-text-muted">&middot;</span>
      <span className="font-medium text-text-primary">{result.newItemsCount} new</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-text-muted text-sm px-6 text-center">
      {message}
    </div>
  );
}

const HISTORY_STATUS_ORDER = ['dismissed', 'executed', 'approved'] as const;
const HISTORY_STATUS_LABELS: Record<string, string> = {
  dismissed: 'Dismissed',
  executed: 'Completed',
  approved: 'Approved',
  edited: 'Edited',
};

function HistoryView({
  items,
  projectId,
  onRestore,
}: {
  items: SlackTriageItem[];
  projectId: string;
  onRestore: (id: string, projectId: string) => Promise<void>;
}) {
  const groupedByStatus = useMemo(() => {
    const groups = new Map<string, SlackTriageItem[]>();
    for (const status of HISTORY_STATUS_ORDER) {
      const statusItems = items.filter((i) => i.status === status);
      if (statusItems.length > 0) {
        groups.set(status, statusItems);
      }
    }
    // Catch any other statuses
    const coveredStatuses = new Set<string>(HISTORY_STATUS_ORDER);
    const other = items.filter((i) => !coveredStatuses.has(i.status));
    if (other.length > 0) {
      groups.set('other', other);
    }
    return groups;
  }, [items]);

  return (
    <div className="p-3 space-y-4">
      {[...groupedByStatus.entries()].map(([status, statusItems]) => (
        <div key={status}>
          <h3 className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-2">
            {HISTORY_STATUS_LABELS[status] ?? status}
          </h3>
          <div className="space-y-2">
            {statusItems.map((item) => (
              <HistoryItemCard key={item.id} item={item} projectId={projectId} onRestore={onRestore} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryItemCard({
  item,
  projectId,
  onRestore,
}: {
  item: SlackTriageItem;
  projectId: string;
  onRestore: (id: string, projectId: string) => Promise<void>;
}) {
  const [isRestoring, setIsRestoring] = useState(false);

  return (
    <div className="rounded-lg border border-border-default bg-surface-1 p-3 opacity-75">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary">{item.topic_summary}</p>
          <p className="text-xxs text-text-muted mt-0.5">
            {ACTION_TYPE_LABELS[item.action_type]}
            {item.resolved_at && ` \u00b7 ${new Date(item.resolved_at).toLocaleDateString()}`}
          </p>
        </div>
          <button
            onClick={async () => {
              setIsRestoring(true);
              try {
                await onRestore(item.id, projectId);
              } finally {
                setIsRestoring(false);
              }
            }}
            disabled={isRestoring}
            className="text-xxs px-2 py-0.5 rounded bg-surface-2 text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-colors disabled:opacity-50 flex-shrink-0"
          >
          </button>
        )}
      </div>
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
