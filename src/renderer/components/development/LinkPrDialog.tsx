/**
 * LinkPrDialog — Link an existing GitHub PR to a session.
 * Accepts a PR number or GitHub PR URL.
 */

import { useState, useRef } from 'react';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { InlineAlert } from '../ui/InlineAlert';
import { SpinnerIcon } from '../icons';
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
      <ModalHeader className="pt-5 pb-3" subtitle="Enter a PR number or GitHub PR URL">
        Link Pull Request
      </ModalHeader>

      <ModalBody className="py-4 space-y-3">
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
          <InlineAlert variant="error" compact>{error}</InlineAlert>
        )}
      </ModalBody>

      <ModalFooter className="py-3">
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
              <SpinnerIcon className="w-3 h-3 animate-spin" />
              Linking...
            </span>
          ) : (
            'Link PR'
          )}
        </MotionButton>
      </ModalFooter>
    </Modal>
  );
}
