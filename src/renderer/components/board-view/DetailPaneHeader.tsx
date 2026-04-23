/**
 */

import { memo, useState, useEffect, useRef } from 'react';
import type { DevSessionWithPlanItem, AgentSessionState } from '../../../shared/types';
import type { BackgroundCommitState } from '../../stores/devSessions';

interface DetailPaneHeaderProps {
  session: DevSessionWithPlanItem;
  agentState: AgentSessionState | undefined;
  commitState?: BackgroundCommitState;
  onClose: () => void;
  onCreatePr: () => void;
  onGeneratePrContent: () => void;
  onLinkPr: () => void;
  onOpenPr: () => void;
  onCopyWorktree: () => void;
}

// =============================================================================
// Overflow menu for secondary / power-user actions
// =============================================================================

interface OverflowItem {
  label: string;
  onClick: () => void;
}

function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((p) => !p)}
        className="p-1 rounded text-text-muted hover:bg-surface-3 transition-colors"
        aria-label="More actions"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="14" cy="8" r="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-2 border border-border-subtle rounded-lg shadow-lg py-1 min-w-[160px]">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-3 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const DetailPaneHeader = memo(function DetailPaneHeader({
  session,
  agentState,
  commitState,
  onClose,
  onCreatePr,
  onGeneratePrContent,
  onLinkPr,
  onOpenPr,
  onCopyWorktree,
}: DetailPaneHeaderProps) {
  const isTerminal = agentState === 'complete' || agentState === 'failed' || agentState === 'stopped';
  const isCommitting = commitState?.status === 'running';
  const isInactiveSession = session.status === 'inactive';
  const hasPr = session.pr_number != null && !!session.pr_url;
  const canManagePostRun = (isTerminal || isInactiveSession) && !isCommitting;
  const title = session.plan_item?.title ?? session.name ?? 'Session';

  const overflowItems: OverflowItem[] = [
    { label: 'Copy worktree path', onClick: onCopyWorktree },
    ...(canManagePostRun ? [{ label: 'PR content', onClick: onGeneratePrContent }] : []),
    ...(canManagePostRun && !hasPr ? [{ label: 'Link existing PR', onClick: onLinkPr }] : []),
  ];

  return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-text-primary line-clamp-2">{title}</h3>
          {session.plan_item?.external_key && (
            <span className="text-tiny text-text-muted">{session.plan_item.external_key}</span>
          )}
        </div>
          {hasPr && (
            <button
              onClick={onOpenPr}
              className="text-tiny px-2 py-1 rounded text-text-secondary hover:bg-surface-3 transition-colors"
            >
              Open PR
            </button>
          )}
          <OverflowMenu items={overflowItems} />
        </div>
      </div>
    </div>
  );
});
