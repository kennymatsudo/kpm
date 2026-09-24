import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { isAgentActive, type AgentActivity } from '../../../shared/agent-types';
import type { AgentSessionState } from '../../../shared/types';
import type { ActivityIconKind, ActivityPresentationEntry, ActivityPresentationGroup } from './activityPresentation';
import { RunOutlineView } from './RunOutlineView';
import type { RunOutline } from './runOutline';

interface ActivityTabProps {
  groups: readonly ActivityPresentationGroup[];
  agentState?: AgentSessionState;
  sessionLabel?: string;
  emptyActiveLabel?: string;
  /** What each finished step concluded, shown above the log. */
  outline?: RunOutline;
  scrollToStep?: StepScrollRequest | null;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ActivityIcon({ icon }: { icon: ActivityIconKind }) {
  if (icon === 'error') {
    return <svg className="w-3.5 h-3.5 text-danger shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.5 3a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0V4Zm.5 7.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>;
  }
  if (icon === 'system') {
    return <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3" opacity="0.5" /></svg>;
  }
  if (icon === 'edit') {
    return <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064L11.19 6.25Z" /></svg>;
  }
  if (icon === 'read') {
    return <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 2.5h5a2 2 0 0 1 2 2v9h-5a2 2 0 0 0-2 2v-13Z" /><path d="M13.5 2.5h-5a2 2 0 0 0-2 2v9h5a2 2 0 0 1 2 2v-13Z" /></svg>;
  }
  if (icon === 'run') {
    return <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="m3 4 3 4-3 4m5 0h5" /></svg>;
  }
  return <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5" /><path strokeLinecap="round" d="M8 5.5v3l2 1.5" /></svg>;
}

function RawDetails({ entry }: { entry: ActivityPresentationEntry }) {
  const activities = entry.kind === 'collapsed' ? entry.activities : [entry.activity];
  const content = entry.result?.content;
  return (
    <div className="collapse-reveal ml-[52px] mr-4 mb-2 p-2.5 bg-surface-1 rounded border border-border-subtle overflow-x-auto">
      <pre className="text-tiny text-text-secondary whitespace-pre-wrap break-words font-mono">{activities.map((activity) => activity.toolInput ?? activity.summary).join('\n\n')}</pre>
      {content && <pre className="mt-2 pt-2 border-t border-border-subtle text-tiny text-text-secondary whitespace-pre-wrap break-words font-mono">{content}</pre>}
    </div>
  );
}

const ActivityEntry = memo(function ActivityEntry({ entry }: { entry: ActivityPresentationEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const activity = entry.kind === 'collapsed' ? entry.activities.at(-1)! : entry.activity;
  const count = entry.kind === 'collapsed' ? entry.activities.length : null;
  const status = entry.status;
  const expandable = entry.kind === 'collapsed' || !!activity.toolInput || !!entry.result?.content;

  return (
    <div className="group">
      <button onClick={() => expandable && setIsExpanded((value) => !value)} className={`w-full flex items-start gap-2.5 px-4 py-2 text-left transition-colors ${expandable ? 'hover:bg-surface-2 cursor-pointer' : 'cursor-default'}`}>
        <span className="w-3 shrink-0 mt-0.5 text-text-muted">
          {expandable && <svg className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
        </span>
        <span className="mt-0.5"><ActivityIcon icon={entry.icon} /></span>
        <span className="flex-1 min-w-0">
          <span className={`text-xs leading-relaxed truncate block ${activity.type === 'error' || status === 'Failed' ? 'text-danger' : 'text-text-secondary'}`}>{entry.label}</span>
          {count && <span className="text-tiny text-text-muted">{count} status checks</span>}
        </span>
        {status && <span className={`text-tiny tabular-nums shrink-0 mt-0.5 ${status === 'Failed' ? 'text-danger' : status === 'Passed' ? 'text-success' : 'text-text-muted'}`}>{status}</span>}
        <span className="text-tiny text-text-muted tabular-nums shrink-0 mt-0.5">{formatTime(activity.timestamp)}</span>
      </button>
      {isExpanded && <RawDetails entry={entry} />}
    </div>
  );
});

const NarrationHeader = memo(function NarrationHeader({ activity }: { activity: AgentActivity }) {
  return <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1.5"><p className="text-xs text-text-primary leading-relaxed line-clamp-3 flex-1 min-w-0">{activity.content || activity.summary}</p><span className="text-tiny text-text-muted tabular-nums shrink-0 mt-0.5">{formatTime(activity.timestamp)}</span></div>;
});

const ActivityGroupView = memo(function ActivityGroupView({ group }: { group: ActivityPresentationGroup }) {
  return <div className="border-b border-border-subtle/40 last:border-0 py-0.5">{group.narration && <NarrationHeader activity={group.narration} />}{group.entries.length > 0 && <div className={group.narration ? 'ml-3 border-l border-border-subtle/50' : ''}>{group.entries.map((entry, index) => <ActivityEntry key={`${entry.kind}-${entry.kind === 'collapsed' ? entry.activities[0].timestamp : entry.activity.timestamp}-${index}`} entry={entry} />)}</div>}</div>;
});

/** A request from the stepper to bring one step's card into view; `nonce` makes a repeat click re-scroll. */
export interface StepScrollRequest {
  stepId: string;
  nonce: number;
}

function EmptyLog({ isActive, emptyActiveLabel }: { isActive: boolean; emptyActiveLabel?: string }) {
  return <div className="flex flex-col items-center justify-center h-32 gap-2 text-text-muted">{isActive ? <><svg className="w-4 h-4 animate-spin text-accent" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" /><path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><span className="text-xs">{emptyActiveLabel ?? 'Working'}</span></> : <span className="text-xs">No activity recorded</span>}</div>;
}

export const ActivityTab = memo(function ActivityTab({ groups, agentState, sessionLabel, emptyActiveLabel, outline, scrollToStep }: ActivityTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isActive = isAgentActive(agentState);
  const hasOutline = Boolean(outline && (outline.steps.length > 0 || outline.criteria));
  // A finished run opens on its outcome, at the top; a live one follows the log.
  const shouldFollowRef = useRef(isActive);
  const [logOpen, setLogOpen] = useState<boolean | null>(null);
  const showLog = logOpen ?? (isActive || !hasOutline);
  const totalItems = useMemo(() => groups.reduce((total, group) => total + (group.narration ? 1 : 0) + group.entries.length, 0), [groups]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && shouldFollowRef.current) element.scrollTop = element.scrollHeight;
  }, [totalItems, showLog]);

  useEffect(() => {
    if (!scrollToStep) return;
    const card = scrollRef.current?.querySelector(`[data-step-id="${CSS.escape(scrollToStep.stepId)}"]`);
    if (!card) return;
    shouldFollowRef.current = false;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [scrollToStep]);

  if (!hasOutline && groups.length === 0) {
    return <EmptyLog isActive={isActive} emptyActiveLabel={emptyActiveLabel} />;
  }

  const latestEntry = groups.at(-1)?.entries.at(-1);
  const logTitle = agentState === 'working' ? 'Working' : agentState === 'complete' ? 'Completed' : 'Agent log';
  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
      {outline && <RunOutlineView outline={outline} />}
      {sessionLabel && <div className="flex items-center gap-2 px-4 py-1.5 bg-surface-0/90 border-b border-border-subtle/40"><div className="flex-1 h-px bg-border-subtle/60" /><span className="text-tiny text-warning/80 font-medium uppercase tracking-wide">{sessionLabel}</span><div className="flex-1 h-px bg-border-subtle/60" /></div>}
      <button
        type="button"
        onClick={() => hasOutline && setLogOpen(!showLog)}
        className={`sticky top-0 z-10 flex w-full items-center gap-2 px-4 py-2 bg-surface-0/90 backdrop-blur-sm border-b border-border-subtle/40 text-left text-xs text-text-secondary ${hasOutline ? 'hover:bg-surface-2' : 'cursor-default'}`}
        aria-expanded={hasOutline ? showLog : undefined}
      >
        <span className="text-text-primary font-medium shrink-0">{logTitle}</span>
        {latestEntry && <span className="min-w-0 truncate text-text-muted">{latestEntry.label}</span>}
        {hasOutline && <span className="ml-auto shrink-0 text-tiny text-text-muted">{showLog ? 'Hide' : `Show ${totalItems} ${totalItems === 1 ? 'entry' : 'entries'}`}</span>}
      </button>
      {showLog && (groups.length === 0
        ? <EmptyLog isActive={isActive} emptyActiveLabel={emptyActiveLabel} />
        : <div className="py-1">{groups.map((group, index) => <ActivityGroupView key={`${group.narration?.timestamp ?? 'orphan'}-${index}`} group={group} />)}</div>)}
    </div>
  );
});
