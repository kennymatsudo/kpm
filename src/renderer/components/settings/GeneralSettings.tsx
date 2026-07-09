import { useEffect } from 'react';
import { SettingsSection, StatusBadge } from './SettingsSection';
import { useClaudeAvailabilityStore, useGeneralSettingsStore } from '../../stores';
import { ChatProviderSettings } from './ChatProviderSettings';
import { UsageSettingsSection } from './UsageSettings';
import { ThemesSettings } from './ThemesSettings';

interface Props {
  currentProjectId?: string | null;
}

export function GeneralSettings({ currentProjectId }: Props = {}) {
  const { availability, isLoading, error, load, refresh } = useClaudeAvailabilityStore();
  const {
    approvalMode,
    isLoadingApprovalMode,
    loadApprovalMode,
    saveApprovalMode,
  } = useGeneralSettingsStore();

  useEffect(() => {
    if (!availability && !isLoading) {
      void load();
    }
    void loadApprovalMode();
  }, [availability, isLoading, load, loadApprovalMode]);

  const handleApprovalToggle = async (checked: boolean) => {
    const result = await saveApprovalMode(checked ? 'manual' : 'auto_apply');
    if (result.success) {
      // Existing Claude sessions keep their current system prompt; execution behavior
      // updates immediately because approval processing reads this setting at event time.
      return;
    }
  };

  let badge: React.ReactNode;
  if (isLoading && !availability) {
    badge = <StatusBadge variant="muted">Checking…</StatusBadge>;
  } else if (!availability || error) {
    badge = <StatusBadge variant="warning">Unknown</StatusBadge>;
  } else if (availability.status === 'bundled') {
    badge = <StatusBadge variant="success">Active</StatusBadge>;
  } else if (availability.status === 'path-fallback') {
    badge = <StatusBadge variant="warning">Using system claude</StatusBadge>;
  } else {
    badge = <StatusBadge variant="warning">Unreachable</StatusBadge>;
  }

  return (
    <div className="space-y-4">
      <SettingsSection
        icon={
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
        }
        title="Claude"
        description="Sign in to Claude Code on your machine — KPM routes AI requests through your local session."
        collapsible={false}
        statusBadge={badge}
      >
        <div className="space-y-3">
          {availability?.status === 'path-fallback' && (
            <div className="rounded-lg bg-warning-muted/40 px-3 py-2 text-xs text-text-secondary">
              <p className="font-medium text-text-primary">Using claude on your PATH</p>
              <p className="mt-1 text-text-muted">{availability.reason}</p>
              <p className="mt-1 break-all text-text-muted">Path: {availability.binaryPath}</p>
            </div>
          )}

          {availability?.status === 'unreachable' && (
            <div className="rounded-lg bg-danger-muted/40 px-3 py-2 text-xs text-text-secondary">
              <p className="font-medium text-text-primary">Claude not found</p>
              <p className="mt-1 text-text-muted">{availability.reason}</p>
              <p className="mt-1 text-text-muted">
                Install Claude Code or reinstall KPM to restore AI features.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-danger">Status check failed: {error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              {isLoading ? 'Checking…' : 'Recheck'}
            </button>
          </div>
        </div>
      </SettingsSection>

      <ChatProviderSettings />

      <SettingsSection
        icon={
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        }
        title="Claude Changes"
        description="Choose whether Claude changes wait for review or apply immediately."
        collapsible={false}
        statusBadge={approvalMode === 'manual' ? <StatusBadge variant="success">Review required</StatusBadge> : <StatusBadge variant="warning">Auto-apply</StatusBadge>}
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary">Review Claude changes before applying</p>
            <p className="text-xs text-text-muted">
              Turn off to apply plan edits, document updates, context changes, and deletions as soon as Claude proposes them.
              Existing chat prompts update on the next new session.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={approvalMode === 'manual'}
            disabled={isLoadingApprovalMode}
            onClick={() => void handleApprovalToggle(approvalMode !== 'manual')}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${approvalMode === 'manual' ? 'bg-accent' : 'bg-surface-4'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${approvalMode === 'manual' ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </SettingsSection>

      <UsageSettingsSection currentProjectId={currentProjectId} />
      <ThemesSettings />
    </div>
  );
}
