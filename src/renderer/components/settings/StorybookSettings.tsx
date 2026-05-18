import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { LoadingSpinner } from '../ui/LoadingButton';
import { selectProjectById, useProjectDomainStore } from '../../stores';
import { useProjectDomainActions } from '../../hooks/useStoreActions';

interface Props {
  currentProjectId: string;
}

export function StorybookSettings({ currentProjectId }: Props) {
  const [storybookUrl, setStorybookUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [storybookError, setStorybookError] = useState<string | null>(null);
  const [storybookSuccess, setStorybookSuccess] = useState<string | null>(null);

  const projects = useProjectDomainStore((state) => state.projects);
  const project = selectProjectById(projects, currentProjectId);
  const { updateProjectStorybookUrl, testStorybookConnection } = useProjectDomainActions();

  useEffect(() => {
    if (project?.storybook_url) {
      setStorybookUrl(project.storybook_url);
    } else {
      setStorybookUrl('');
    }
  }, [project?.storybook_url]);

  const handleTest = async () => {
    if (!storybookUrl.trim()) {
      setStorybookError('Please enter a URL');
      return;
    }
    setIsTesting(true);
    setStorybookError(null);
    setStorybookSuccess(null);
    try {
      const result = await testStorybookConnection(storybookUrl.trim());
      if (result.success) {
        setStorybookSuccess(`Connected! Found ${result.componentCount} entries`);
        setTimeout(() => setStorybookSuccess(null), 3000);
      } else {
        setStorybookError(result.error || 'Connection failed');
      }
    } catch (e) {
      setStorybookError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStorybookError(null);
    setStorybookSuccess(null);
    try {
      await updateProjectStorybookUrl(currentProjectId, storybookUrl.trim() || null);
      setStorybookSuccess('Storybook URL saved');
      setTimeout(() => setStorybookSuccess(null), 2000);
    } catch (e) {
      setStorybookError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    setStorybookError(null);
    try {
      await updateProjectStorybookUrl(currentProjectId, null);
      setStorybookUrl('');
      setStorybookSuccess('Storybook URL removed');
      setTimeout(() => setStorybookSuccess(null), 2000);
    } catch (e) {
      setStorybookError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setIsSaving(false);
    }
  };

  const isProcessing = isTesting || isSaving;
  const hasExistingUrl = !!project?.storybook_url;

  return (
    <div className="space-y-4">
      {/* Status indicator */}
      <AnimatePresence mode="wait">
        {hasExistingUrl && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2.5 px-3.5 py-2.5 bg-success-muted/60 rounded-xl"
          >
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-success/20">
              <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm text-success font-medium">Storybook connected</span>
          </m.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
          Storybook URL
        </label>
        <input
          type="url"
          value={storybookUrl}
          onChange={(e) => setStorybookUrl(e.target.value)}
          placeholder="http://localhost:6006"
          disabled={isProcessing}
          className="w-full px-4 py-2.5 bg-surface-2 border border-border-subtle rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface-1 transition-all disabled:opacity-50"
        />
        <p className="text-xs text-text-muted">
          Enter the URL where your Storybook is running
        </p>
      </div>

      {/* Status messages */}
      <AnimatePresence mode="wait">
        {storybookError && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-danger-muted/60 text-danger text-sm"
          >
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>{storybookError}</span>
          </m.div>
        )}
        {storybookSuccess && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-success-muted/60 text-success text-sm"
          >
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span>{storybookSuccess}</span>
          </m.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <div>
          {hasExistingUrl && (
            <button
              onClick={handleRemove}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-danger hover:bg-danger-muted/50 rounded-lg transition-all disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              <span>Remove</span>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={isTesting || !storybookUrl.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-surface-3 text-text-primary rounded-xl hover:bg-surface-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isTesting ? (
              <>
                <LoadingSpinner className="w-4 h-4" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span>Test Connection</span>
              </>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner className="w-4 h-4" />
                Saving...
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
