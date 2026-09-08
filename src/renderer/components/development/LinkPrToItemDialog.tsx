/**
 * LinkPrToItemDialog — Link an existing GitHub PR to a plan item.
 * Works without a pre-existing dev session by creating a stub session if needed.
 */

import { useState, useRef } from 'react';
import type { Repo } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { InlineAlert } from '../ui/InlineAlert';
import { SpinnerIcon } from '../icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { toast } from '../../stores/toastStore';
import { linkPullRequestToPlanItem } from '../../services/githubService';
import { getBaseName } from '../../utils/path';

interface LinkPrToItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  planItemId: string;
  repos: Repo[];
  onLinked?: () => void;
}

export function LinkPrToItemDialog({
  isOpen,
  onClose,
  planItemId,
  repos,
  onLinked,
}: LinkPrToItemDialogProps) {
  const [prIdentifier, setPrIdentifier] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id ?? '');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setPrIdentifier('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const repoId = selectedRepoId || repos[0]?.id;
    if (!prIdentifier.trim() || !repoId) return;

    setIsLinking(true);
    setError(null);
    try {
      const result = await linkPullRequestToPlanItem({ planItemId, repoId, prIdentifier: prIdentifier.trim() });
      if (result.success) {
        toast.success(`Linked PR #${result.number}`);
        onLinked?.();
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

        {repos.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Repository</label>
            <Select value={selectedRepoId} onValueChange={setSelectedRepoId}>
              <SelectTrigger
                aria-label="Repository"
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <SelectValue />
                <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </SelectTrigger>
              <SelectContent style={{ minWidth: 'var(--radix-select-trigger-width)' }}>
                {repos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    <SelectItemText>{getBaseName(repo.path, repo.path)}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
          disabled={isLinking || !prIdentifier.trim() || repos.length === 0}
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
