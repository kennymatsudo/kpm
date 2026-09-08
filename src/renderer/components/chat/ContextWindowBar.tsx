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

  const usedLabel = `${formatK(total)}${cacheRead > 0 ? ` (${formatK(cacheRead)} cached)` : ''}`;

  if (provider === 'pi') {
    return (
      <div className="pointer-events-none mb-1.5 px-1 flex items-center gap-2">
        <div className="flex-1 h-px bg-surface-3 rounded-full overflow-hidden" aria-hidden="true" />
        <span className="text-tiny text-text-muted tabular-nums shrink-0">
          {usage ? `${usedLabel} used` : `limit ${formatK(contextWindow)}`}
        </span>
      </div>
    );
  }

  const pct = Math.min(100, (total / contextWindow) * 100);

  // Fullness is reported in words as well as in hue: the bar is 1px tall, so
  // color alone would be the only carrier of a state worth acting on.
  let barColor = 'bg-surface-4';
  let level: string | null = null;
  if (pct >= 90) {
    barColor = 'bg-danger';
    level = 'nearly full';
  } else if (pct >= 75) {
    barColor = 'bg-warning';
    level = 'filling up';
  }

  return (
    <div className="mb-1.5 px-1 flex items-center gap-2">
      <div
        className="flex-1 h-px bg-surface-3 rounded-full overflow-hidden"
        role="progressbar"
        aria-label="Context window used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${usedLabel} of ${formatK(contextWindow)}${level ? `, ${level}` : ''}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-150 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-tiny tabular-nums shrink-0 ${level ? 'text-text-secondary' : 'text-text-muted'}`}
      >
        {usage ? `${usedLabel} / ${formatK(contextWindow)}` : `— / ${formatK(contextWindow)}`}
        {level && <span className="ml-1">· {level}</span>}
      </span>
    </div>
  );
}
