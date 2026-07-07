/**
 * UsageSettings — Claude API usage and cost dashboard.
 *
 * Lives as a section inside Settings > General (alongside AI Provider).
 * Layout intentionally mirrors what users see in familiar billing dashboards
 * (Anthropic Console, OpenAI Platform, GitHub billing): big headline numbers,
 * a per-source breakdown table, then a recent-events drilldown list.
 *
 * Exposed two ways:
 *   - <UsageSettings /> — full page (used standalone if ever needed)
 *   - <UsageSettingsSection /> — wrapped in SettingsSection, default-collapsed
 *
 * Data lifecycle:
 *   - Initial load: getProjectStats(projectId) or getGlobalStats()
 *   - Live updates: subscribe to onUsageEvent() and re-fetch debounced
 *   - Reset (per-project only): resetProjectUsage() then reload
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingSpinner } from '../ui/LoadingButton';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog';
import { SettingsSection, StatusBadge } from './SettingsSection';
import {
  getProjectUsageStats,
  getGlobalUsageStats,
  listUsageEvents,
  resetProjectUsage,
  onUsageEvent,
} from '../../services/usageService';
import {
  formatCurrency,
  formatTokensFull,
  formatSource,
  formatModel,
  formatEventTimestamp,
  formatMsAsSeconds,
  resolveModelTier,
  modelTierLabel,
  type ModelTier,
} from '../../utils/usageFormatters';
import type {
  ClaudeUsageEvent,
  ClaudeUsageProjectBreakdownRow,
  ProjectUsageStats,
} from '../../../shared/usage-types';

type Scope = 'project' | 'global';

interface TierRow {
  tier: ModelTier;
  events: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_micro_usd: number;
}

/**
 * Per-tier accent classes. Chosen for clear visual differentiation without
 * implying value judgement: Opus is the priciest (warmer), Sonnet the
 * workhorse (accent blue), Haiku the cheapest (cool green). Uses existing
 * theme tokens — see index.css.
 */
const TIER_STYLE: Record<ModelTier, { bg: string; dot: string; ring: string }> = {
  opus:   { bg: 'bg-warning',  dot: 'bg-warning',  ring: 'ring-warning/30' },
  sonnet: { bg: 'bg-accent',   dot: 'bg-accent',   ring: 'ring-accent/30' },
  haiku:  { bg: 'bg-success',  dot: 'bg-success',  ring: 'ring-success/30' },
  other:  { bg: 'bg-text-muted', dot: 'bg-text-muted', ring: 'ring-text-muted/30' },
};

interface Props {
  currentProjectId?: string | null;
  initialStats?: ProjectUsageStats;
  initialEvents?: ClaudeUsageEvent[];
}

export function UsageSettings({ currentProjectId, initialStats, initialEvents }: Props) {
  const [scope, setScope] = useState<Scope>(currentProjectId ? 'project' : 'global');
  const [stats, setStats] = useState<ProjectUsageStats | null>(initialStats ?? null);
  const [recentEvents, setRecentEvents] = useState<ClaudeUsageEvent[]>(initialEvents ?? []);
  const [showRecent, setShowRecent] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialStats);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // If the user opens settings without a project, force "all projects" scope
  // and disable the project toggle below.
  const canScopeProject = !!currentProjectId;
  const effectiveScope: Scope = canScopeProject ? scope : 'global';
  const projectIdForQuery = effectiveScope === 'project' ? (currentProjectId ?? null) : null;

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [statsResult, eventsResult] = await Promise.all([
        effectiveScope === 'project' && currentProjectId
          ? getProjectUsageStats(currentProjectId)
          : getGlobalUsageStats(),
        listUsageEvents(projectIdForQuery, 50),
      ]);
      setStats(statsResult);
      setRecentEvents(eventsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveScope, currentProjectId, projectIdForQuery]);

  useEffect(() => {
    setIsLoading(true);
    void reload();
  }, [reload]);

  // Live event subscription — debounce reloads so a chat session emitting
  // back-to-back results doesn't thrash the dashboard.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = onUsageEvent((event) => {
      // Filter to current scope: skip events from other projects when the
      // dashboard is project-scoped.
      if (effectiveScope === 'project' && event.projectId !== currentProjectId) {
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void reload();
      }, 750);
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribe();
    };
  }, [reload, effectiveScope, currentProjectId]);

  const handleReset = useCallback(async () => {
    if (!currentProjectId) return;
    setIsResetting(true);
    try {
      await resetProjectUsage(currentProjectId);
      setConfirmingReset(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsResetting(false);
    }
  }, [currentProjectId, reload]);

  const totals = stats?.totals;
  const totalTokens = useMemo(() => {
    if (!totals) return 0;
    return totals.input_tokens + totals.output_tokens + totals.cache_creation_tokens + totals.cache_read_tokens;
  }, [totals]);

  const cacheReadRate = useMemo(() => {
    if (!totals) return null;
    const cachedInput = totals.cache_read_tokens;
    const totalInput = totals.input_tokens + totals.cache_creation_tokens + totals.cache_read_tokens;
    if (totalInput === 0) return null;
    return cachedInput / totalInput;
  }, [totals]);

  // Aggregate the (source, model) breakdown into a per-tier view. Subagents
  // run on a different model than the parent (e.g. Sonnet under an Opus chat),
  // so the per-tier rollup reveals routing patterns the source breakdown hides.
  const byModelTier = useMemo<TierRow[]>(() => {
    const map = new Map<ModelTier, TierRow>();
    for (const row of stats?.breakdown ?? []) {
      const tier = resolveModelTier(row.model);
      const existing = map.get(tier);
      if (existing) {
        existing.events += row.events;
        existing.input_tokens += row.input_tokens;
        existing.output_tokens += row.output_tokens;
        existing.cache_creation_tokens += row.cache_creation_tokens;
        existing.cache_read_tokens += row.cache_read_tokens;
        existing.cost_micro_usd += row.cost_micro_usd;
      } else {
        map.set(tier, {
          tier,
          events: row.events,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          cache_creation_tokens: row.cache_creation_tokens,
          cache_read_tokens: row.cache_read_tokens,
          cost_micro_usd: row.cost_micro_usd,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cost_micro_usd - a.cost_micro_usd);
  }, [stats?.breakdown]);

  const totalCostMicroUsd = totals?.cost_micro_usd ?? 0;

  return (
    <div className="space-y-5">
      {/* Scope toggle (top-right of section content) */}
      {canScopeProject && (
        <div className="flex justify-end">
          <ScopeToggle scope={scope} onChange={setScope} />
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-danger-muted/50 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-3">
          <LoadingSpinner className="w-4 h-4 text-text-muted" />
          <p className="text-text-secondary text-sm">Loading usage…</p>
        </div>
      ) : !totals || totals.events === 0 ? (
        <EmptyState scope={effectiveScope} hasProject={canScopeProject} />
      ) : (
        <>
          <SummaryRow
            costMicroUsd={totals.cost_micro_usd}
            totalTokens={totalTokens}
            events={totals.events}
            cacheReadRate={cacheReadRate}
            byModelTier={byModelTier}
          />

          {byModelTier.length > 1 && (
            <ModelBreakdownPanel rows={byModelTier} totalCostMicroUsd={totalCostMicroUsd} />
          )}

          <BreakdownTable rows={stats?.breakdown ?? []} />

          {stats?.byProject && stats.byProject.length > 0 && (
            <ProjectBreakdownTable rows={stats.byProject} />
          )}

          <div>
            <button
              onClick={() => setShowRecent((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              aria-expanded={showRecent}
            >
              <ChevronIcon expanded={showRecent} />
              Recent activity
              <span className="text-text-muted font-normal">({recentEvents.length})</span>
            </button>
            {showRecent && (
              <div className="mt-3">
                <RecentEventsTable events={recentEvents} />
              </div>
            )}
          </div>
        </>
      )}

      {canScopeProject && totals && totals.events > 0 && (
        <div className="pt-4 border-t border-border-subtle">
          <button
            onClick={() => setConfirmingReset(true)}
            className="text-xs text-danger hover:underline"
          >
            Reset usage for this project
          </button>
        </div>
      )}

      {confirmingReset && currentProjectId && (
        <ConfirmActionDialog
          title="Reset project usage?"
          message={
            <>
              Clears all recorded Claude events for this project and zeroes the token count.
              {' '}<span className="text-warning">This can&apos;t be undone.</span>
              {' '}Other projects are unaffected.
            </>
          }
          dialogId="reset-usage-dialog"
          onCancel={() => setConfirmingReset(false)}
          action={{
            label: 'Reset usage',
            loadingText: 'Resetting…',
            variant: 'danger',
            onClick: handleReset,
            ariaLabel: 'Reset Claude usage for this project',
          }}
        />
      )}

      {/* Hidden when reset is in flight via dialog; isResetting is the dialog's
          own state. Keeping a no-op reference avoids unused-var warnings if the
          dialog gets refactored. */}
      <span hidden aria-hidden>{isResetting ? '' : ''}</span>
    </div>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function ScopeToggle({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Usage scope"
      className="inline-flex rounded-lg bg-surface-2 border border-border-subtle p-0.5 text-xs"
    >
      <ScopeTab active={scope === 'project'} onClick={() => onChange('project')}>
        This project
      </ScopeTab>
      <ScopeTab active={scope === 'global'} onClick={() => onChange('global')}>
        All projects
      </ScopeTab>
    </div>
  );
}

function ScopeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1 rounded-md transition-colors ${
        active ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryRow({
  costMicroUsd,
  totalTokens,
  events,
  cacheReadRate,
  byModelTier,
}: {
  costMicroUsd: number;
  totalTokens: number;
  events: number;
  cacheReadRate: number | null;
  byModelTier: TierRow[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <SummaryCard
        label="Estimated cost"
        value={formatCurrency(costMicroUsd)}
        accent
        footer={byModelTier.length > 0 ? <ModelDistributionBar rows={byModelTier} totalCostMicroUsd={costMicroUsd} /> : undefined}
      />
      <SummaryCard label="Total tokens" value={formatTokensFull(totalTokens)} />
      <SummaryCard label="Runs" value={formatTokensFull(events)} />
      <SummaryCard
        label="Cache read rate"
        value={cacheReadRate === null ? '—' : `${Math.round(cacheReadRate * 100)}%`}
        hint={cacheReadRate === null ? undefined : 'cached input / total input'}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  hint,
  footer,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`p-3 rounded-xl border ${accent ? 'bg-accent-subtle border-accent/30' : 'bg-surface-2 border-border-subtle'}`}>
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-text-primary'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

/**
 * Thin horizontal stacked bar showing cost share by model tier. Sits inside
 * the cost summary card so users see the routing split at a glance — Opus
 * vs Sonnet vs Haiku — without expanding the panel below.
 */
function ModelDistributionBar({
  rows,
  totalCostMicroUsd,
}: {
  rows: TierRow[];
  totalCostMicroUsd: number;
}) {
  if (totalCostMicroUsd === 0 || rows.length === 0) return null;
  // Filter zero-cost rows so the bar matches the visible legend.
  const visible = rows.filter((r) => r.cost_micro_usd > 0);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-1.5" aria-label="Cost share by model tier">
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={visible
          .map((r) => `${modelTierLabel(r.tier)} ${Math.round((r.cost_micro_usd / totalCostMicroUsd) * 100)}%`)
          .join(', ')}
      >
        {visible.map((r) => {
          const share = r.cost_micro_usd / totalCostMicroUsd;
          if (share <= 0) return null;
          return (
            <div
              key={r.tier}
              className={TIER_STYLE[r.tier].bg}
              style={{ width: `${share * 100}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-text-muted">
        {visible.map((r) => (
          <span key={r.tier} className="inline-flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${TIER_STYLE[r.tier].dot}`} aria-hidden />
            {modelTierLabel(r.tier)} {Math.round((r.cost_micro_usd / totalCostMicroUsd) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-tier rollup. Distinct from the (source × model) BreakdownTable: this
 * answers "where is my money going across models?" — useful now that subagents
 * route work to cheaper tiers under the same source label.
 */
function ModelBreakdownPanel({
  rows,
  totalCostMicroUsd,
}: {
  rows: TierRow[];
  totalCostMicroUsd: number;
}) {
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 border-b border-border-subtle flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">By model</p>
        <p className="text-[11px] text-text-muted">
          Subagents (e.g. <span className="font-medium">explorer</span>) route reads to cheaper models in an isolated context.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-text-muted uppercase tracking-wide">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">Model</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Runs</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Tokens</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Share</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tokens = row.input_tokens + row.output_tokens + row.cache_creation_tokens + row.cache_read_tokens;
            const share = totalCostMicroUsd === 0 ? 0 : row.cost_micro_usd / totalCostMicroUsd;
            return (
              <tr key={row.tier} className="border-t border-border-subtle hover:bg-surface-2/40">
                <td className="px-3 py-2 text-text-primary">
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${TIER_STYLE[row.tier].dot}`} aria-hidden />
                    {modelTierLabel(row.tier)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatTokensFull(row.events)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatTokensFull(tokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                  {totalCostMicroUsd === 0 ? '—' : `${Math.round(share * 100)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-primary font-medium">
                  {formatCurrency(row.cost_micro_usd)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTable({ rows }: { rows: ProjectUsageStats['breakdown'] }) {
  if (rows.length === 0) {
    return (
      <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
        <p className="text-sm text-text-secondary">No breakdown to show.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-text-muted uppercase tracking-wide">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">Source</th>
            <th scope="col" className="text-left font-medium px-3 py-2">Model</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Runs</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Input</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Output</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Cache hit</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.source}-${row.model}-${i}`}
              className="border-t border-border-subtle hover:bg-surface-2/40"
            >
              <td className="px-3 py-2 text-text-primary">{formatSource(row.source)}</td>
              <td className="px-3 py-2 text-text-secondary">
                <span className="inline-flex items-center gap-2">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${TIER_STYLE[resolveModelTier(row.model)].dot}`} aria-hidden />
                  {formatModel(row.model)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatTokensFull(row.events)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                {formatTokensFull(row.input_tokens + row.cache_creation_tokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatTokensFull(row.output_tokens)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                {formatTokensFull(row.cache_read_tokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-primary font-medium">
                {formatCurrency(row.cost_micro_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectBreakdownTable({ rows }: { rows: ClaudeUsageProjectBreakdownRow[] }) {
  const totalCost = rows.reduce((sum, r) => sum + r.cost_micro_usd, 0);
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 border-b border-border-subtle">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">By project</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-text-muted uppercase tracking-wide">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">Project</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Runs</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Tokens</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Share</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tokens = row.input_tokens + row.output_tokens + row.cache_creation_tokens + row.cache_read_tokens;
            const share = totalCost === 0 ? 0 : row.cost_micro_usd / totalCost;
            return (
              <tr
                key={row.project_id ?? '__null__'}
                className="border-t border-border-subtle hover:bg-surface-2/40"
              >
                <td className="px-3 py-2 text-text-primary">
                  {row.project_name ?? (
                    <span className="text-text-muted italic">Unattributed</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatTokensFull(row.events)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatTokensFull(tokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                  {totalCost === 0 ? '—' : `${Math.round(share * 100)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-primary font-medium">
                  {formatCurrency(row.cost_micro_usd)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatEventLatency(durationMs: number | null, ttftMs: number | null): string {
  const parts: string[] = [];
  if (durationMs !== null) parts.push(formatMsAsSeconds(durationMs));
  if (ttftMs !== null) parts.push(`first token ${formatMsAsSeconds(ttftMs)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function RecentEventsTable({ events }: { events: ClaudeUsageEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
        <p className="text-sm text-text-secondary">No recent events.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden max-h-80 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-surface-2 text-text-muted uppercase tracking-wide sticky top-0">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">When</th>
            <th scope="col" className="text-left font-medium px-3 py-2">Source</th>
            <th scope="col" className="text-left font-medium px-3 py-2">Model</th>
            <th scope="col" className="text-right font-medium px-3 py-2">In</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Out</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Cost</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Latency</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-border-subtle">
              <td className="px-3 py-1.5 text-text-secondary whitespace-nowrap">{formatEventTimestamp(event.created_at)}</td>
              <td className="px-3 py-1.5 text-text-primary">{formatSource(event.source)}</td>
              <td className="px-3 py-1.5 text-text-secondary">{formatModel(event.model)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text-secondary">
                {formatTokensFull(event.input_tokens + event.cache_creation_tokens + event.cache_read_tokens)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text-secondary">
                {formatTokensFull(event.output_tokens)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text-primary">
                {formatCurrency(event.cost_micro_usd)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text-secondary whitespace-nowrap">
                {formatEventLatency(event.duration_ms, event.ttft_ms)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ scope, hasProject }: { scope: Scope; hasProject: boolean }) {
  const message = scope === 'project'
    ? 'No Claude usage tracked yet for this project. Send a chat message or run a board task to get started.'
    : hasProject
      ? 'No Claude usage tracked yet. Send a chat message or run a board task to get started.'
      : 'No Claude usage tracked yet. Open a project to start using Claude features.';
  return (
    <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

// =============================================================================
// Section Wrapper (used inside General tab)
// =============================================================================

/**
 * Wraps <UsageSettings /> in a SettingsSection card that lives alongside other
 * General tab sections. Shows a small "$X.XX" badge in the section header so
 * users can see lifetime cost without expanding.
 */
export function UsageSettingsSection({ currentProjectId }: { currentProjectId?: string | null }) {
  const [preloaded, setPreloaded] = useState<{ stats: ProjectUsageStats; events: ClaudeUsageEvent[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const projectIdForQuery = currentProjectId ?? null;
    const load = async () => {
      try {
        const [stats, events] = await Promise.all([
          currentProjectId ? getProjectUsageStats(currentProjectId) : getGlobalUsageStats(),
          listUsageEvents(projectIdForQuery, 50),
        ]);
        if (!cancelled) setPreloaded({ stats, events });
      } catch {
        // ignore — UsageSettings will handle its own error state on expand
      }
    };
    void load();
    const unsubscribe = onUsageEvent(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentProjectId]);

  const badge = preloaded === null
    ? null
    : (
      <StatusBadge variant="muted">
        {formatCurrency(preloaded.stats.totals.cost_micro_usd)}
      </StatusBadge>
    );

  return (
    <SettingsSection
      icon={
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      }
      title="Claude usage"
      description="Token use and estimated cost across all AI features"
      collapsible
      defaultCollapsed
      statusBadge={badge}
    >
      <UsageSettings
        currentProjectId={currentProjectId}
        initialStats={preloaded?.stats}
        initialEvents={preloaded?.events}
      />
    </SettingsSection>
  );
}
