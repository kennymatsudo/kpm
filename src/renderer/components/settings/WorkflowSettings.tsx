import { useState, useEffect, useMemo } from 'react';
import { LoadingSpinner } from '../ui/LoadingButton';
import { useGeneralSettingsStore } from '../../stores';
import { toast } from '../../stores/toastStore';
import { SettingsSection, StatusBadge } from './SettingsSection';

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

  const branchNamePreview = useMemo(() => {
    if (!branchTemplate) {
      return 'PROJ-123-example-branch-name';
    }
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    let preview = branchTemplate
      .replace(/{date}/g, dateStr)
      .replace(/{ticket}/g, 'PROJ-123')
      .replace(/{name}/g, 'example-branch-name')
      .replace(/{id}/g, 'abc123');
    preview = preview
      .replace(/[_\-/]{2,}/g, (match) => match[0])
      .replace(/[_-]$/g, '')
      .replace(/^[_-]/g, '');
    return preview;
  }, [branchTemplate]);

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
                  {[
                    { var: '{date}', desc: 'YYYYMM (e.g., 202601)' },
                    { var: '{ticket}', desc: 'External key (e.g., PROJ-123)' },
                    { var: '{name}', desc: 'Plan item title slug' },
                    { var: '{id}', desc: 'Plan item ID (6 chars)' },
                  ].map((item) => (
                    <div key={item.var} className="flex items-center gap-2">
                      <code className="px-1 py-0.5 bg-surface-3 rounded text-xxs text-accent font-mono">
                        {item.var}
                      </code>
                      <span className="text-xxs text-text-muted">{item.desc}</span>
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
