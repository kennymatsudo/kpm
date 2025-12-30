import { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingButton';

interface Props {
  onClose: () => void;
}

export function ApiKeyDialog({ onClose }: Props) {
  const [apiKey, setApiKey] = useState('');

  // Check if there's an existing key on mount
  useEffect(() => {

  const handleTest = async () => {
    if (!apiKey) {
      return;
    }

    }
  };

  const handleSave = async () => {
    if (!apiKey) {
      return;
    }

    }
  };

  const handleDelete = async () => {
    }
  };


  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      preventClose={isProcessing}
      aria-labelledby="api-key-title"
    >
      <ModalHeader id="api-key-title" onClose={onClose}>
        Anthropic API Key
      </ModalHeader>

      <ModalBody className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-success-muted rounded-lg">
            <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-success">API key configured</span>
          </div>
        )}

        <div>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-text-muted mt-1.5">
            Your API key is stored securely in the system keychain and is never sent anywhere except Anthropic's API.
          </p>
        </div>

        <div className="text-xs text-text-muted">
          <p className="mb-2">
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://console.anthropic.com/settings/keys', '_blank');
              }}
            >
              Get your API key
            </a>{' '}
            from the Anthropic Console.
          </p>
          <p>
            Using an API key means you pay per-use rather than through a Claude Code subscription.
          </p>
        </div>

      </ModalBody>

      <ModalFooter className="justify-between">
        <div>
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-sm text-danger hover:text-red-300 hover:bg-danger-muted rounded-lg transition-colors disabled:opacity-50"
            >
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            className="px-4 py-2 text-sm bg-surface-3 text-text-primary rounded-lg hover:bg-surface-3/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
              <span className="flex items-center gap-2">
                <LoadingSpinner className="w-4 h-4" />
                Testing...
              </span>
            ) : (
              'Test Key'
            )}
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary"
          >
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
