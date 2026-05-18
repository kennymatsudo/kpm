import { useState } from 'react';
import { useCredentialStore } from '../../../stores';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../../ui/Modal';
import { LoadingSpinner } from '../../ui/LoadingButton';
import type { TrackerCredentialInfo } from '../../../../shared/types';

interface Props {
  credential: TrackerCredentialInfo | null;
  onClose: () => void;
}

export function JiraConfigDialog({ credential, onClose }: Props) {
  const { testCredentials, saveCredentials, deleteCredentials, loadCredentials } = useCredentialStore();

  const [siteUrl, setSiteUrl] = useState(credential?.site_url ?? '');
  const [email, setEmail] = useState(credential?.email ?? '');
  const [apiToken, setApiToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!siteUrl || !email || !apiToken) {
      setError('All fields are required');
      return;
    }

    setIsTesting(true);
    setError(null);

    try {
      const result = await testCredentials({ type: 'jira', siteUrl, email, apiToken });
      if (result.success) {
      } else {
        setError(result.error || 'Connection failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!siteUrl || !email || !apiToken) {
      setError('All fields are required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await saveCredentials({ type: 'jira', siteUrl, email, apiToken });
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to save credentials');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (credential) {
      await deleteCredentials('jira');
      await loadCredentials();
      onClose();
    }
  };

  const isProcessing = isTesting || isSaving;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      preventClose={isProcessing}
      aria-labelledby="jira-config-title"
    >
      <ModalHeader id="jira-config-title" onClose={onClose}>
        {credential ? 'Jira Settings' : 'Connect to Jira'}
      </ModalHeader>

      <ModalBody className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Jira Site URL
          </label>
          <input
            type="text"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="yourcompany.atlassian.net"
            className="w-full px-3 py-2 bg-surface-2 border border-border-subtle rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="text-xs text-text-muted mt-1">
            The domain of your Jira Cloud instance
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-3 py-2 bg-surface-2 border border-border-subtle rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            API Token
          </label>
          <p className="text-xs text-text-muted mt-1">
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://id.atlassian.com/manage-profile/security/api-tokens', '_blank');
              }}
            >
              Generate an API token
            </a>{' '}
            in your Atlassian account settings
          </p>
        </div>

        {error && (
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter className="justify-between">
        <div>
          {credential && (
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 text-sm text-danger hover:text-red-300 hover:bg-danger-muted rounded-lg transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={isTesting || !siteUrl || !email || !apiToken}
            className="px-4 py-2 text-sm bg-surface-3 text-text-primary rounded-lg hover:bg-surface-3/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isTesting ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner className="w-4 h-4" />
                Testing...
              </span>
            ) : (
              'Test Connection'
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !siteUrl || !email || !apiToken}
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
      </ModalFooter>
    </Modal>
  );
}
