import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useBriefingStore,
  useChatStore,
  useProjectUiDomainStore,
} from '../../stores';
import type { FocusedResource } from '../../../shared/types';
import { getBaseName } from '../../utils/path';

interface WorkspaceHomeProps {
  onShowChat: () => void;
}

interface QuickStart {
  label: string;
  text: string;
}

const QUICK_STARTS: QuickStart[] = [
  { label: 'Plan', text: 'Break a feature into trackable subtasks' },
  { label: 'Code', text: 'Walk me through how this module works' },
  { label: 'Review', text: 'Find risky changes in my latest PRs' },
  { label: 'Doc', text: 'Update CLAUDE.md with the latest conventions' },
];

function getResourceLabel(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
    case 'document':
      return resource.title;
    case 'project_file':
      return getBaseName(resource.path, resource.path);
    case 'repo':
      return resource.path ? getBaseName(resource.path, resource.path) : 'Repository';
  }
}

function getResourceTypeLabel(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
      return 'Plan item';
    case 'project_file':
      return 'Project file';
    case 'repo':
      return resource.path ? 'Repo file' : 'Repo';
    case 'document':
      return 'Document';
  }
}

function BullseyeIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function WorkspaceHome({ onShowChat }: WorkspaceHomeProps) {
  const openBriefing = useBriefingStore((state) => state.openModal);
  const focusedResources = useProjectUiDomainStore((state) => state.focusedResources);

  const {
    viewedSessionId,
    viewedSessionMessageCount,
    setDraftMessage,
    getChatSessionId,
    getOrCreateSession,
  } = useChatStore(
    useShallow((state) => {
      const viewedSession = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId) ?? null
        : null;

      return {
        viewedSessionId: state.viewedSessionId,
        viewedSessionMessageCount: viewedSession?.messages.length ?? 0,
        setDraftMessage: state.setDraftMessage,
        getChatSessionId: state.getChatSessionId,
        getOrCreateSession: state.getOrCreateSession,
      };
    })
  );

  const hasConversation = viewedSessionId !== null && viewedSessionMessageCount > 0;
  const contextPreview = useMemo(() => focusedResources.slice(0, 4), [focusedResources]);

  const handleQuickStart = useCallback(
    (text: string) => {
      const sessionId = viewedSessionId ?? getChatSessionId();
      getOrCreateSession(sessionId);
      setDraftMessage(sessionId, text);
      onShowChat();
    },
    [viewedSessionId, getChatSessionId, getOrCreateSession, setDraftMessage, onShowChat]
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-surface-0">
      <div
        className="flex-1 grid place-items-center px-10 py-10 overflow-y-auto"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 40%, var(--color-surface-1) 0%, transparent 60%)',
        }}
      >
        <div className="w-[480px] max-w-full flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border-default grid place-items-center text-accent">
            <BullseyeIcon />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-[20px] font-semibold tracking-tight text-text-primary">
              What are we shipping today?
            </h2>
            <p className="text-[13px] leading-snug text-text-tertiary max-w-[380px] mx-auto">
              Pick a starting point, pull up your briefing, or open chat.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full mt-1">
            {QUICK_STARTS.map((q) => (
              <button
                key={q.label}
                onClick={() => handleQuickStart(q.text)}
                className="text-left bg-surface-1 border border-border-subtle hover:border-border-strong rounded-lg px-3.5 py-3 transition-colors"
              >
                <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-tertiary mb-1">
                  {q.label}
                </div>
                <div className="text-[13px] leading-snug text-text-primary">
                  {q.text}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={onShowChat}
              className="rounded-md bg-accent text-surface-0 hover:bg-accent/90 px-3 py-1.5 text-[12px] font-medium transition-colors"
            >
              {hasConversation ? `Resume chat · ${viewedSessionMessageCount} msgs` : 'Open chat'}
            </button>
            <button
              onClick={openBriefing}
              className="rounded-md bg-surface-2 border border-border-subtle hover:border-border-default px-3 py-1.5 text-[12px] text-text-secondary transition-colors"
            >
              Project briefing
            </button>
          </div>

          {contextPreview.length > 0 && (
            <div className="w-full mt-2 pt-4 border-t border-border-subtle">
              <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.1em] text-text-tertiary text-center">
                Current Context
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {contextPreview.map((resource, index) => (
                  <div
                    key={`${resource.type}-${index}`}
                    className="max-w-full rounded-md bg-surface-2 border border-border-subtle px-2.5 py-1.5"
                  >
                    <div className="text-[9px] font-mono uppercase tracking-wide text-text-tertiary">
                      {getResourceTypeLabel(resource)}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-text-primary" title={getResourceLabel(resource)}>
                      {getResourceLabel(resource)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
