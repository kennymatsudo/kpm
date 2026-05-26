import { resolveModelContextWindow } from '../../../shared/usage-types';
import type { PerSessionState } from '../../stores/chat/types';

function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

interface ContextWindowBarProps {
  usage: PerSessionState['lastTurnUsage'];
  model: string | null | undefined;
}

export function ContextWindowBar({ usage, model }: ContextWindowBarProps) {
  const contextWindow = usage?.contextWindow ?? resolveModelContextWindow(model);

  // input_tokens is only the uncached portion. Total context sent to the model
  // is input + cache reads + cache writes — that's what fills the context window.
  const total = (usage?.inputTokens ?? 0) + (usage?.cacheReadTokens ?? 0) + (usage?.cacheCreationTokens ?? 0);
  const cacheRead = usage?.cacheReadTokens ?? 0;
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
