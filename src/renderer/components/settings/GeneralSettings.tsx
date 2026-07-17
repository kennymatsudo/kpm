import { useEffect } from 'react';
import { SettingsSection, StatusBadge } from './SettingsSection';
import { useGeneralSettingsStore } from '../../stores';
import { ChatProviderSettings } from './ChatProviderSettings';
import { ProvidersSettings } from './ProvidersSettings';

export function GeneralSettings() {
  const {
    approvalMode,
    isLoadingApprovalMode,
    loadApprovalMode,
    saveApprovalMode,
    respectGlobalClaudeMd,
    isLoadingRespectGlobalClaudeMd,
    loadRespectGlobalClaudeMd,
    saveRespectGlobalClaudeMd,
  } = useGeneralSettingsStore();

  useEffect(() => {
    void loadApprovalMode();
    void loadRespectGlobalClaudeMd();
  }, [loadApprovalMode, loadRespectGlobalClaudeMd]);

  const handleApprovalToggle = async (checked: boolean) => {
    const result = await saveApprovalMode(checked ? 'manual' : 'auto_apply');
    if (result.success) {
      // Existing Claude sessions keep their current system prompt; execution behavior
      // updates immediately because approval processing reads this setting at event time.
      return;
    }
  };

  const handleGlobalInstructionsToggle = async (checked: boolean) => {
    await saveRespectGlobalClaudeMd(checked);
  };

  return (
    <div className="space-y-4">
      <ProvidersSettings />

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
              Turn off to apply plan edits, document updates, context changes, and deletions as soon as they are proposed.
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

      <SettingsSection
        icon={
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        }
        title="Global Instructions"
        description="Apply your personal ~/.claude/CLAUDE.md preferences in chat."
        collapsible={false}
        statusBadge={respectGlobalClaudeMd ? <StatusBadge variant="success">On</StatusBadge> : <StatusBadge variant="warning">Off</StatusBadge>}
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary">Follow my global instructions in chat</p>
            <p className="text-xs text-text-muted">
              Folds your <code>~/.claude/CLAUDE.md</code> into the chat system prompt so replies follow your personal preferences.
              KPM&rsquo;s own rules still take precedence. Applies to chat only; existing chats update on the next new session.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={respectGlobalClaudeMd}
            disabled={isLoadingRespectGlobalClaudeMd}
            onClick={() => void handleGlobalInstructionsToggle(!respectGlobalClaudeMd)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${respectGlobalClaudeMd ? 'bg-accent' : 'bg-surface-4'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${respectGlobalClaudeMd ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
