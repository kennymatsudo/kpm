/**
 * Link To Confluence Modal
 *
 * Allows users to link a document to a Confluence page.
 */

import { useState, useRef } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { useConfluenceStore } from '../../stores/confluenceStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  documentPath: string;
  documentTitle: string;
}

export function LinkToConfluenceModal({
  isOpen,
  onClose,
  projectId,
  documentPath,
  documentTitle,
}: Props) {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const linkDocument = useConfluenceStore((s) => s.linkDocument);

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('Please enter a Confluence URL');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await linkDocument(projectId, documentPath, url.trim());

    setIsSubmitting(false);

    if (result.success) {
      setUrl('');
      onClose();
    } else {
      setError(result.error ?? 'Failed to link document');
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setUrl('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      initialFocusRef={inputRef}
      preventClose={isSubmitting}
      aria-labelledby="link-confluence-title"
    >
      <ModalHeader id="link-confluence-title" onClose={handleClose}>
        Link to Confluence
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Document
            </label>
            <div className="text-sm text-text-primary font-medium">
              {documentTitle}
            </div>
            <div className="text-xs text-text-muted">{documentPath}</div>
          </div>

          <div>
            <label htmlFor="confluence-url" className="block text-sm text-text-secondary mb-1">
              Confluence Page URL
            </label>
            <input
              ref={inputRef}
              id="confluence-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://company.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title"
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-text-muted">
              Paste the URL of the Confluence page to sync with this document.
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <MotionButton
          variant="secondary"
          onClick={handleClose}
          disabled={isSubmitting}
        >
          Cancel
        </MotionButton>
        <MotionButton
          variant="primary"
          onClick={handleSubmit}
          disabled={isSubmitting || !url.trim()}
        >
          {isSubmitting ? 'Linking...' : 'Link Document'}
        </MotionButton>
      </ModalFooter>
    </Modal>
  );
}
