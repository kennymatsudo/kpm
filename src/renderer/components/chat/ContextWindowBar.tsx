import { resolveModelContextWindow } from '../../../shared/usage-types';
import type { ChatProvider } from '../../../shared/types';
import type { PerSessionState } from '../../stores/chat/types';

function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

interface ContextWindowBarProps {
  usage: PerSessionState['lastTurnUsage'];
  model: string | null | undefined;
  provider?: ChatProvider | null;
  contextWindow?: number | null;
}

function reportedPromptTokens(usage: PerSessionState['lastTurnUsage']): number {
  return (usage?.inputTokens ?? 0) + (usage?.cacheReadTokens ?? 0) + (usage?.cacheCreationTokens ?? 0);
}

export function ContextWindowBar({ usage, model, provider, contextWindow: selectedContextWindow }: ContextWindowBarProps) {
  const contextWindow = usage?.contextWindow ?? selectedContextWindow ?? resolveModelContextWindow(model);
  const total = reportedPromptTokens(usage);
  const cacheRead = usage?.cacheReadTokens ?? 0;

  if (provider === 'pi') {
    return (
      <div className="pointer-events-none mb-1.5 px-1 flex items-center gap-2">
        <div className="flex-1 h-px bg-surface-3 rounded-full overflow-hidden" />
        <span className="text-xxs text-text-muted tabular-nums shrink-0">
          {usage
            ? `${formatK(total)}${cacheRead > 0 ? ` (${formatK(cacheRead)} cached)` : ''} reported`
            : `limit ${formatK(contextWindow)}`}
        </span>
      </div>
    );
  }

  const pct = Math.min(100, (total / contextWindow) * 100);

  let barColor = 'bg-text-muted/40';
  if (pct >= 90) barColor = 'bg-danger';
  else if (pct >= 75) barColor = 'bg-warning';

  return (
    <div className="pointer-events-none mb-1.5 px-1 flex items-center gap-2">
      <div className="flex-1 h-px bg-surface-3 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xxs text-text-muted tabular-nums shrink-0">
        {usage
          ? `${formatK(total)}${cacheRead > 0 ? ` (${formatK(cacheRead)} cached)` : ''} / ${formatK(contextWindow)}`
          : `— / ${formatK(contextWindow)}`}
      </span>
    </div>
  );
}
