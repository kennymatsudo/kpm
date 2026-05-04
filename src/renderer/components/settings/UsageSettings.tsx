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
} from '../../utils/usageFormatters';
import type {
  ClaudeUsageEvent,
  ProjectUsageStats,
} from '../../../shared/usage-types';

type Scope = 'project' | 'global';

interface Props {
  currentProjectId?: string | null;
}

  const [scope, setScope] = useState<Scope>(currentProjectId ? 'project' : 'global');
  const [showRecent, setShowRecent] = useState(false);
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
          />

          <BreakdownTable rows={stats?.breakdown ?? []} />

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
}: {
  costMicroUsd: number;
  totalTokens: number;
  events: number;
  cacheReadRate: number | null;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

  return (
    <div className={`p-3 rounded-xl border ${accent ? 'bg-accent-subtle border-accent/30' : 'bg-surface-2 border-border-subtle'}`}>
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-text-primary'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
      } catch {
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

    ? null
    : (
      <StatusBadge variant="muted">
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
    </SettingsSection>
  );
}
