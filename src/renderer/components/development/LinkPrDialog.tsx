/**
 * LinkPrDialog — Link an existing GitHub PR to a session.
 * Accepts a PR number or GitHub PR URL.
 */

import { useState, useRef } from 'react';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import { Modal } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { toast } from '../../stores/toastStore';

interface LinkPrDialogProps {
  isOpen: boolean;
  onClose: () => void;
  session: DevSessionWithPlanItem;
}

export function LinkPrDialog({ isOpen, onClose, session }: LinkPrDialogProps) {
  const linkPullRequest = useDevSessionsStore((state) => state.linkPullRequest);
  const [prIdentifier, setPrIdentifier] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setPrIdentifier('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!prIdentifier.trim()) return;

    setIsLinking(true);
    setError(null);
    try {
      const result = await linkPullRequest(session.id, prIdentifier.trim());
      if (result.success) {
        toast.success(`Linked PR #${result.number}`);
        handleClose();
      } else {
        setError(result.error || 'Failed to link PR');
      }
    } catch {
      setError('Failed to link PR');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm" preventClose={isLinking} initialFocusRef={inputRef}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
          <h2 className="text-base font-medium text-text-primary">Link Pull Request</h2>
          <p className="text-xs text-text-muted mt-1">
            Enter a PR number or GitHub PR URL
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={prIdentifier}
            onChange={(e) => {
              setPrIdentifier(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && prIdentifier.trim()) {
                void handleSubmit();
              }
            }}
            placeholder="#123 or https://github.com/owner/repo/pull/123"
            className="w-full px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors font-mono"
          />

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/20">
              <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <MotionButton
            onClick={handleClose}
            disabled={isLinking}
            className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary bg-surface-3/50 hover:bg-surface-3 rounded-md transition-colors"
          >
            Cancel
          </MotionButton>
          <MotionButton
            onClick={handleSubmit}
            disabled={isLinking || !prIdentifier.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLinking ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Linking...
              </span>
            ) : (
              'Link PR'
            )}
          </MotionButton>
        </div>
      </div>
    </Modal>
  );
}
