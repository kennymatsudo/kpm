import { useState } from 'react';

interface Props {
  credential: TrackerCredentialInfo | null;
  onClose: () => void;
}

export function JiraConfigDialog({ credential, onClose }: Props) {

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
      await loadCredentials();
      onClose();
    }
  };

  return (
        </div>


        </div>

          </div>
            <button
            >
            </button>
        </div>
  );
}
