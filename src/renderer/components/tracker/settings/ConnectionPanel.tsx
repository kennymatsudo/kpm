import { useState, useEffect } from 'react';
import { useCredentialStore } from '../../../stores';
import { LoadingSpinner } from '../../ui/LoadingButton';
import type { TrackerType } from '../../../../shared/types';

interface Props {
  trackerType: TrackerType;
}

export function ConnectionPanel({ trackerType }: Props) {
  return trackerType === 'jira' ? <JiraConnectionPanel /> : <LinearConnectionPanel />;
}

function JiraConnectionPanel() {
  const {
    credentials,
    isLoading,
    error,
    testCredentials,
    saveCredentials,
    deleteCredentials,
    clearError,
  } = useCredentialStore();

  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const currentCredential = credentials.find((credential) => credential.type === 'jira');
  const hasCredentials = Boolean(currentCredential);

  useEffect(() => {
    if (currentCredential) {
      setSiteUrl(currentCredential.site_url || '');
      setEmail(currentCredential.email || '');
      setApiToken('');
    }
  }, [currentCredential]);

  const handleTest = async () => {
    if (!siteUrl || !email || !apiToken) {
      setLocalError('Please fill in all fields');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setLocalError(null);
    try {
      const result = await testCredentials({ type: 'jira', siteUrl, email, apiToken });
      setTestResult(
        result.success
          ? { success: true, message: 'Connection successful!' }
          : { success: false, message: result.error || 'Connection failed' }
      );
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!siteUrl || !email || !apiToken) {
      setLocalError('Please fill in all fields');
      return;
    }
    setIsSaving(true);
    setLocalError(null);
    clearError();
    const result = await saveCredentials({ type: 'jira', siteUrl, email, apiToken });
    if (!result.success) {
      setLocalError(result.error || 'Failed to save credentials');
    } else {
      setApiToken('');
      setTestResult(null);
    }
    setIsSaving(false);
  };

  const handleDisconnect = async () => {
    setIsSaving(true);
    await deleteCredentials('jira');
    setSiteUrl('');
    setEmail('');
    setApiToken('');
    setTestResult(null);
    setIsSaving(false);
  };

  const displayError = localError || error;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner className="w-6 h-6 text-accent mb-3" />
        <p className="text-text-secondary text-sm">Loading connection...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Jira Connection</h3>
        <p className="text-sm text-text-secondary mt-1">
          Connect to your Jira instance to sync issues with KPM
        </p>
      </div>

      {hasCredentials && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-success-muted/50 border border-success/20">
          <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-success">Connected</p>
            <p className="text-xs text-text-secondary">{currentCredential?.site_url}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Jira Site URL</label>
          <input
            type="text"
            value={siteUrl}
            onChange={(e) => { setSiteUrl(e.target.value); setTestResult(null); }}
            placeholder="yourcompany.atlassian.net"
            className="input"
            disabled={isSaving}
          />
          <p className="text-xs text-text-tertiary mt-1">Your Atlassian domain without https://</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setTestResult(null); }}
            placeholder="you@company.com"
            className="input"
            disabled={isSaving}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">API Token</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={(e) => { setApiToken(e.target.value); setTestResult(null); }}
              placeholder={hasCredentials ? '••••••••••••••••' : 'Enter your API token'}
              className="input pr-20"
              disabled={isSaving}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover transition-colors"
            >
              Generate an API token
            </a>{' '}
            from your Atlassian account
          </p>
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-xl ${testResult.success ? 'bg-success-muted/50 border border-success/20' : 'bg-danger-muted/50 border border-danger/20'}`}>
          <svg className={`w-4 h-4 flex-shrink-0 ${testResult.success ? 'text-success' : 'text-danger'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {testResult.success ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            )}
          </svg>
          <span className={`text-sm ${testResult.success ? 'text-success' : 'text-danger'}`}>{testResult.message}</span>
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-muted/50 border border-danger/20">
          <svg className="w-4 h-4 flex-shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm text-danger">{displayError}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {hasCredentials && (
          <button onClick={handleDisconnect} disabled={isSaving} className="btn btn-danger">Disconnect</button>
        )}
        <div className="flex-1" />
        <button onClick={handleTest} disabled={isTesting || isSaving || !siteUrl || !email || !apiToken} className="btn btn-secondary">
          {isTesting ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </button>
        <button onClick={handleSave} disabled={isSaving || !siteUrl || !email || !apiToken} className="btn btn-primary">
          {isSaving ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Saving...
            </>
          ) : hasCredentials ? (
            'Update'
          ) : (
            'Connect'
          )}
        </button>
      </div>
    </div>
  );
}

function LinearConnectionPanel() {
  const {
    credentials,
    isLoading,
    error,
    testCredentials,
    saveCredentials,
    deleteCredentials,
    clearError,
  } = useCredentialStore();

  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const currentCredential = credentials.find((credential) => credential.type === 'linear');
  const hasCredentials = Boolean(currentCredential);

  const handleTest = async () => {
    if (!apiToken) {
      setLocalError('Please enter your Linear API key');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setLocalError(null);
    try {
      const result = await testCredentials({ type: 'linear', apiToken });
      setTestResult(
        result.success
          ? { success: true, message: 'Connection successful!' }
          : { success: false, message: result.error || 'Connection failed' }
      );
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiToken) {
      setLocalError('Please enter your Linear API key');
      return;
    }
    setIsSaving(true);
    setLocalError(null);
    clearError();
    const result = await saveCredentials({ type: 'linear', apiToken });
    if (!result.success) {
      setLocalError(result.error || 'Failed to save credentials');
    } else {
      setApiToken('');
      setTestResult(null);
    }
    setIsSaving(false);
  };

  const handleDisconnect = async () => {
    setIsSaving(true);
    await deleteCredentials('linear');
    setApiToken('');
    setTestResult(null);
    setIsSaving(false);
  };

  const displayError = localError || error;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner className="w-6 h-6 text-accent mb-3" />
        <p className="text-text-secondary text-sm">Loading connection...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Linear Connection</h3>
        <p className="text-sm text-text-secondary mt-1">
          Connect to Linear with a personal API key to sync issues with KPM
        </p>
      </div>

      {hasCredentials && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-success-muted/50 border border-success/20">
          <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-success">Connected</p>
            <p className="text-xs text-text-secondary">linear.app</p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Personal API Key</label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={apiToken}
            onChange={(e) => { setApiToken(e.target.value); setTestResult(null); }}
            placeholder={hasCredentials ? '••••••••••••••••' : 'lin_api_…'}
            className="input pr-20"
            disabled={isSaving}
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          <a
            href="https://linear.app/settings/account/security"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-hover transition-colors"
          >
            Create a personal API key
          </a>{' '}
          from your Linear account settings
        </p>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-xl ${testResult.success ? 'bg-success-muted/50 border border-success/20' : 'bg-danger-muted/50 border border-danger/20'}`}>
          <svg className={`w-4 h-4 flex-shrink-0 ${testResult.success ? 'text-success' : 'text-danger'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {testResult.success ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            )}
          </svg>
          <span className={`text-sm ${testResult.success ? 'text-success' : 'text-danger'}`}>{testResult.message}</span>
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-muted/50 border border-danger/20">
          <svg className="w-4 h-4 flex-shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm text-danger">{displayError}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {hasCredentials && (
          <button onClick={handleDisconnect} disabled={isSaving} className="btn btn-danger">Disconnect</button>
        )}
        <div className="flex-1" />
        <button onClick={handleTest} disabled={isTesting || isSaving || !apiToken} className="btn btn-secondary">
          {isTesting ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </button>
        <button onClick={handleSave} disabled={isSaving || !apiToken} className="btn btn-primary">
          {isSaving ? (
            <>
              <LoadingSpinner className="w-4 h-4" />
              Saving...
            </>
          ) : hasCredentials ? (
            'Update'
          ) : (
            'Connect'
          )}
        </button>
      </div>
    </div>
  );
}
