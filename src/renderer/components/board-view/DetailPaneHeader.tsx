/**
 */

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
        </div>
      </div>
    </div>
  );
});
