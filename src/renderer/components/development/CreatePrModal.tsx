/**
 * CreatePrModal — Pre-filled PR creation form.
 * Fetches context from GitHubService, lets user edit title/body, then creates the PR.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { InlineAlert } from '../ui/InlineAlert';
import { SpinnerIcon } from '../icons';
import { toast } from '../../stores/toastStore';
import { listPrContextDocuments, type PrContextDocumentTarget } from './prContextDocuments';

interface CreatePrModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: DevSessionWithPlanItem;
  onPrCreated: () => void;
}

export function CreatePrModal({ isOpen, onClose, session, onPrCreated }: CreatePrModalProps) {
  const loadPrContext = useDevSessionsStore((state) => state.loadPrContext);
  const createPullRequest = useDevSessionsStore((state) => state.createPullRequest);
  const isCreating = useDevSessionsStore((state) => state.prCreatingIds.has(session.id));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [noCommits, setNoCommits] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [branchPushed, setBranchPushed] = useState<boolean | undefined>(undefined);
  const [hasGeneratedContext, setHasGeneratedContext] = useState(false);
  const [contextDocuments, setContextDocuments] = useState<PrContextDocumentTarget[]>([]);
  const [isLoadingContextDocuments, setIsLoadingContextDocuments] = useState(false);
  const [featureContextPath, setFeatureContextPath] = useState<string>('');
  const titleRef = useRef<HTMLInputElement>(null);
  const loadContextRequestIdRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => () => {
    isOpenRef.current = false;
  }, []);

  const loadContext = useCallback((selectedFeatureContextPath: string | null) => {
    const requestId = loadContextRequestIdRef.current + 1;
    loadContextRequestIdRef.current = requestId;
    setIsLoadingContext(true);
    setAuthError(null);
    setNoCommits(false);
    setAiGenerated(false);
    setHasGeneratedContext(false);
    setTitle('');
    setBody('');

    void loadPrContext(session.id, {
      force: true,
      featureContextPath: selectedFeatureContextPath,
    })
      .then((result) => {
        if (loadContextRequestIdRef.current !== requestId) return;
        if (!result.success || !result.context) {
          setAuthError(result.error || 'Failed to load PR context');
          setIsLoadingContext(false);
          return;
        }

        if (result.context.hasCommits === false) {
          setNoCommits(true);
          setIsLoadingContext(false);
          return;
        }

        setTitle(result.context.suggestedTitle);
        setBody(result.context.body);
        setAiGenerated(result.context.aiGenerated === true);
        setBranchPushed(result.context.branchPushed);
        setHasGeneratedContext(true);
        setIsLoadingContext(false);
      })
      .catch(() => {
        if (loadContextRequestIdRef.current !== requestId) return;
        setAuthError('Failed to load PR context');
        setIsLoadingContext(false);
      });
  }, [loadPrContext, session.id]);

  // Fetch PR context when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setFeatureContextPath('');
    setContextDocuments([]);
    setIsLoadingContext(false);
    setAuthError(null);
    setNoCommits(false);
    setAiGenerated(false);
    setBranchPushed(undefined);
    setHasGeneratedContext(false);
    setTitle('');
    setBody('');

    let cancelled = false;
    setIsLoadingContextDocuments(true);
    listPrContextDocuments(session.project_id)
      .then((documents) => {
        if (!cancelled) setContextDocuments(documents);
      })
      .catch(() => {
        if (!cancelled) setContextDocuments([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContextDocuments(false);
      });

    return () => {
      cancelled = true;
      loadContextRequestIdRef.current += 1;
    };
  }, [isOpen, loadContext, session.project_id]);

  const handleFeatureContextChange = (value: string) => {
    setFeatureContextPath(value);
    if (hasGeneratedContext) {
      loadContext(value || null);
    }
  };

  const handleGenerate = () => {
    loadContext(featureContextPath || null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('PR title is required');
      return;
    }

    setCreateError(null);
    // The modal can be closed, or its card unmounted, while the push runs, so the
    // outcome is reported as a toast whenever nobody is watching the form.
    const result = await createPullRequest(session.id, title.trim(), body, draft);
    if (result.success) {
      toast.success(`PR #${result.number} created`);
      onPrCreated();
      if (isOpenRef.current) onClose();
      return;
    }
    const error = result.error || 'Unknown error';
    if (isOpenRef.current) {
      // Shown in the modal, which stays open, so the output can be read in full.
      setCreateError(error);
    } else {
      toast.error(`Could not create the pull request: ${error.split('\n')[0]}`, {
        label: 'Copy',
        onClick: () => void navigator.clipboard?.writeText(error),
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" initialFocusRef={titleRef}>
      <ModalHeader
        className="pt-5 pb-3"
        subtitle={<>{session.branch_name} &rarr; {session.base_branch}</>}
      >
        Create Pull Request
      </ModalHeader>

      <ModalBody className="py-4 space-y-4">
        {isCreating && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <SpinnerIcon className="w-3 h-3 animate-spin shrink-0" />
            {branchPushed === false
              ? 'Pushing the branch, then opening the pull request. Pre-push hooks can take a few minutes. You can close this window; a notification appears when it finishes.'
              : 'Opening the pull request. You can close this window; a notification appears when it finishes.'}
          </p>
        )}
        {authError ? (
          <InlineAlert variant="error" title="GitHub not connected">{authError}</InlineAlert>
        ) : noCommits ? (
          <InlineAlert variant="warning" title="Nothing to push">
            This branch is even with the base branch. Commit your changes first.
          </InlineAlert>
        ) : isLoadingContext ? (
          <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-xs">
            <SpinnerIcon className="w-4 h-4 animate-spin" />
            Generating PR title and description...
          </div>
        ) : !hasGeneratedContext ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="pr-feature-context" className="block text-xs font-medium text-text-secondary mb-1.5">
                Feature context
              </label>
              <select
                id="pr-feature-context"
                value={featureContextPath}
                onChange={(event) => handleFeatureContextChange(event.target.value)}
                disabled={isCreating || isLoadingContextDocuments || contextDocuments.length === 0}
                className="w-full px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
              >
                <option value="">
                  {isLoadingContextDocuments
                    ? 'Loading documents...'
                    : contextDocuments.length === 0
                      ? 'No markdown documents found'
                      : 'No document'}
                </option>
                {contextDocuments.map((document) => (
                  <option key={document.path} value={document.path}>
                    {document.path}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <>
            {/* Title */}
            <div>
              <label htmlFor="pr-title" className="block text-xs font-medium text-text-secondary mb-1.5">
                Title
              </label>
              <input
                ref={titleRef}
                id="pr-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="PR title"
                className="w-full px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
                maxLength={256}
              />
            </div>

            {/* Body */}
            <div>
              <label htmlFor="pr-body" className="block text-xs font-medium text-text-secondary mb-1.5">
                Description
              </label>
              <div className="mb-3">
                <label htmlFor="pr-feature-context" className="block text-xs font-medium text-text-secondary mb-1.5">
                  Feature context
                </label>
                <select
                  id="pr-feature-context"
                  value={featureContextPath}
                  onChange={(event) => handleFeatureContextChange(event.target.value)}
                  disabled={isLoadingContext || isCreating || isLoadingContextDocuments || contextDocuments.length === 0}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                >
                  <option value="">
                    {isLoadingContextDocuments
                      ? 'Loading documents...'
                      : contextDocuments.length === 0
                        ? 'No markdown documents found'
                        : 'No document'}
                  </option>
                  {contextDocuments.map((document) => (
                    <option key={document.path} value={document.path}>
                      {document.path}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                id="pr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="PR description"
                rows={12}
                className="w-full px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors font-mono resize-y"
              />
              <p className={`mt-1 text-tiny ${aiGenerated ? 'text-text-muted' : 'text-amber-500'}`}>
                {aiGenerated
                  ? 'Drafted from committed changes and plan context.'
                  : 'Using commit summary because drafting was unavailable.'}
              </p>
            </div>

            {/* Draft toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft}
                onChange={(e) => setDraft(e.target.checked)}
                className="rounded border-border-subtle bg-surface-1 text-accent focus:ring-accent/50"
              />
              <span className="text-xs text-text-secondary">Create as draft</span>
            </label>
            {createError && <CreatePrError error={createError} />}
          </>
        )}
      </ModalBody>

      <ModalFooter className="py-3">
        <MotionButton
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary bg-surface-3/50 hover:bg-surface-3 rounded-md transition-colors"
        >
          {isCreating ? 'Close' : 'Cancel'}
        </MotionButton>
        <MotionButton
          onClick={hasGeneratedContext ? handleSubmit : handleGenerate}
          disabled={
            isCreating ||
            isLoadingContext ||
            isLoadingContextDocuments ||
            !!authError ||
            noCommits ||
            (hasGeneratedContext && !title.trim())
          }
          className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? (
            <span className="flex items-center gap-1.5">
              <SpinnerIcon className="w-3 h-3 animate-spin" />
              Creating...
            </span>
          ) : isLoadingContext ? (
            <span className="flex items-center gap-1.5">
              <SpinnerIcon className="w-3 h-3 animate-spin" />
              Generating...
            </span>
          ) : !hasGeneratedContext ? (
            'Generate'
          ) : (
            draft ? 'Create Draft PR' : 'Create PR'
          )}
        </MotionButton>
      </ModalFooter>
    </Modal>
  );
}

/** The first line says what went wrong; any remaining lines are the raw output behind it. */
function CreatePrError({ error }: { error: string }) {
  const [summary, ...rest] = error.split('\n');
  const details = rest.join('\n').trim();

  return (
    <InlineAlert variant="error" title="Could not create the pull request">
      <span className="block break-words">{summary}</span>
      {details && (
        <details className="mt-2">
          <summary className="cursor-pointer text-text-secondary hover:text-text-primary">Show output</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-tiny text-text-secondary">
            {details}
          </pre>
        </details>
      )}
    </InlineAlert>
  );
}
