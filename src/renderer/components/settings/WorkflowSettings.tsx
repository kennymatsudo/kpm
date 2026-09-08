import { useState, useEffect, useMemo } from 'react';
import { LoadingSpinner } from '../ui/LoadingButton';
import { useGeneralSettingsStore } from '../../stores';
import { toast } from '../../stores/toastStore';
import { SettingsSection, StatusBadge } from './SettingsSection';
import { TrackerSettings } from './TrackerSettings';
import { StorybookSettings } from './StorybookSettings';
import {
  BRANCH_NAME_TEMPLATE_VARIABLES,
  previewBranchName,
} from '../../../shared/branchNaming';

type WorkflowSubTab = 'git' | 'tracker' | 'storybook';

const SUB_TABS: { id: WorkflowSubTab; label: string; requiresProject?: boolean }[] = [
  { id: 'tracker', label: 'Tracker', requiresProject: true },
  { id: 'git', label: 'Git' },
  { id: 'storybook', label: 'Storybook', requiresProject: true },
];

interface Props {
  currentProjectId?: string | null;
}

function ProjectGatedMessage() {
  return (
    <div className="flex items-center justify-center py-12 text-text-muted text-sm">
      Open a project to configure this integration
    </div>
  );
}

export function WorkflowSettings({ currentProjectId }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<WorkflowSubTab>(currentProjectId ? 'tracker' : 'git');

  return (
    <div>
      {/* Sticky sub-tab strip */}
      <div className="sticky top-0 z-10 bg-surface-elevated px-5 pt-3 pb-0">
        <div className="flex gap-1 border-b border-border -mx-5 px-5">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-t transition-colors
                ${activeSubTab === tab.id
                  ? 'text-accent bg-surface-elevated border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text-secondary'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {activeSubTab === 'git' && <GitSubTab />}
        {activeSubTab === 'tracker' && (
          <div className="space-y-4">
            <IssueAssignmentSection />
            {currentProjectId ? <TrackerSettings currentProjectId={currentProjectId} /> : <ProjectGatedMessage />}
          </div>
        )}
        {activeSubTab === 'storybook' && (
          currentProjectId ? <StorybookSettings currentProjectId={currentProjectId} /> : <ProjectGatedMessage />
        )}
      </div>
    </div>
  );
}

function IssueAssignmentSection() {
  const {
    assignExportedIssuesToMe,
    isLoadingAssignExportedIssuesToMe,
    loadAssignExportedIssuesToMe,
    saveAssignExportedIssuesToMe,
  } = useGeneralSettingsStore();

  useEffect(() => {
    void loadAssignExportedIssuesToMe();
  }, [loadAssignExportedIssuesToMe]);

  const handleToggle = async (next: boolean) => {
    const result = await saveAssignExportedIssuesToMe(next);
    if (!result.success) toast.error(result.error || 'Failed to save issue assignment setting');
  };

  return (
    <SettingsSection
      icon={
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      }
      title="Issue Assignment"
      description="Choose who new issues are assigned to when you export them."
      collapsible={false}
      statusBadge={assignExportedIssuesToMe ? <StatusBadge variant="success">On</StatusBadge> : <StatusBadge variant="warning">Off</StatusBadge>}
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-primary">Assign issues I export to me</p>
          <p className="text-xs text-text-muted">
            New Jira and Linear issues are assigned to your connected tracker account. Existing issues are never
            reassigned, so a change you make in the tracker stays put.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={assignExportedIssuesToMe}
          disabled={isLoadingAssignExportedIssuesToMe}
          onClick={() => void handleToggle(!assignExportedIssuesToMe)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${assignExportedIssuesToMe ? 'bg-accent' : 'bg-surface-4'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${assignExportedIssuesToMe ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>
    </SettingsSection>
  );
}

function GitSubTab() {
  const {
    branchTemplate: savedBranchTemplate,
    isLoadingBranchTemplate,
    loadGeneralSettings,
    saveBranchTemplate,
  } = useGeneralSettingsStore();
  const [branchTemplate, setBranchTemplate] = useState('');
  const [branchSettingsDirty, setBranchSettingsDirty] = useState(false);

  useEffect(() => {
    void loadGeneralSettings();
  }, [loadGeneralSettings]);

  useEffect(() => {
    setBranchTemplate(savedBranchTemplate);
    setBranchSettingsDirty(false);
  }, [savedBranchTemplate]);

  const handleBranchTemplateChange = (value: string) => {
    setBranchTemplate(value);
    setBranchSettingsDirty(true);
  };

  const handleSaveBranchSettings = async () => {
    const result = await saveBranchTemplate(branchTemplate);
    if (result.success) {
      toast.success('Branch naming preferences saved');
      setBranchSettingsDirty(false);
    } else {
      toast.error(result.error || 'Failed to save settings');
    }
  };

  const branchNamePreview = useMemo(() => previewBranchName(branchTemplate), [branchTemplate]);

  return (
    <div className="space-y-4">
      <SettingsSection
        icon={
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        }
        title="Branch Naming"
        description="Customize how worktree branches are named"
        statusBadge={
          branchSettingsDirty ? (
            <StatusBadge variant="warning">Unsaved</StatusBadge>
          ) : undefined
        }
      >
        {isLoadingBranchTemplate ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3">
              <LoadingSpinner className="w-4 h-4" />
              <span className="text-sm text-text-muted font-mono">Loading preferences...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary">
                Branch Name Template
              </label>
              <input
                type="text"
                value={branchTemplate}
                onChange={(e) => handleBranchTemplateChange(e.target.value)}
                placeholder="e.g., {ticket}-{name} or {date}/{ticket}-{name}"
                className="w-full px-3 py-2 bg-surface-2 rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent border border-transparent focus:border-accent/30 transition-all font-mono"
              />
              <div className="space-y-1">
                <p className="text-xs text-text-muted">
                  Available variables:
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {BRANCH_NAME_TEMPLATE_VARIABLES.map((variable) => (
                    <div key={variable.token} className="flex items-center gap-2">
                      <code className="px-1 py-0.5 bg-surface-3 rounded text-xxs text-accent font-mono">
                        {variable.token}
                      </code>
                      <span className="text-xxs text-text-muted">{variable.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface-3/50 border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted">Preview</span>
                <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <code className="text-xs font-mono text-info break-all">
                {branchNamePreview}
              </code>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveBranchSettings}
                disabled={!branchSettingsDirty}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Branch Settings
              </button>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
