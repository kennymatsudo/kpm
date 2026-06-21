/**
 * GeneratePrContentModal — View/copy the AI-generated PR title and description
 * without actually creating a PR. Useful when the user creates the PR manually
 * and wants to paste (or API-insert) the description.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import type { DevSessionWithPlanItem } from '../../../shared/types';
import { useDevSessionsStore } from '../../stores/devSessions';
import { Modal } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { copyToClipboard } from '../../utils/clipboard';
import { listPrContextDocuments, type PrContextDocumentTarget } from './prContextDocuments';

interface GeneratePrContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: DevSessionWithPlanItem;
}

export function GeneratePrContentModal({ isOpen, onClose, session }: GeneratePrContentModalProps) {
  const loadPrContext = useDevSessionsStore((state) => state.loadPrContext);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [noCommits, setNoCommits] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [hasGeneratedContext, setHasGeneratedContext] = useState(false);
  const [contextDocuments, setContextDocuments] = useState<PrContextDocumentTarget[]>([]);
  const [isLoadingContextDocuments, setIsLoadingContextDocuments] = useState(false);
  const [featureContextPath, setFeatureContextPath] = useState<string>('');
  const titleRef = useRef<HTMLInputElement>(null);
  const loadContextRequestIdRef = useRef(0);

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
        setHasGeneratedContext(true);
        setIsLoadingContext(false);
      })
      .catch(() => {
        if (loadContextRequestIdRef.current !== requestId) return;
        setAuthError('Failed to load PR context');
        setIsLoadingContext(false);
      });
  }, [loadPrContext, session.id]);

  useEffect(() => {
    if (!isOpen) return;

    setFeatureContextPath('');
    setContextDocuments([]);
    setIsLoadingContext(false);
    setAuthError(null);
    setNoCommits(false);
    setAiGenerated(false);
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

  const handleCopy = (value: string, label: string) => copyToClipboard(value, label);

  const canCopy = hasGeneratedContext && !isLoadingContext && !authError && !noCommits;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" initialFocusRef={titleRef}>
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
          <h2 className="text-base font-medium text-text-primary">PR Content</h2>
          <p className="text-xs text-text-muted mt-1">
            {session.branch_name} &rarr; {session.base_branch}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-4">
          {authError ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-red-500/10 border border-red-500/20">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
              <div>
                <p className="text-xs text-red-400 font-medium">GitHub not connected</p>
                <p className="text-xs text-text-muted mt-1">{authError}</p>
              </div>
            </div>
          ) : noCommits ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
              <div>
                <p className="text-xs text-amber-400 font-medium">No commits to generate content from</p>
                <p className="text-xs text-text-muted mt-1">
                  This branch has no commits ahead of the base branch. Commit your changes first.
                </p>
              </div>
            </div>
          ) : isLoadingContext ? (
            <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-xs">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Generating PR title and description...
            </div>
          ) : !hasGeneratedContext ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="pr-content-feature-context" className="block text-xs font-medium text-text-secondary mb-1.5">
                  Feature context
                </label>
                <select
                  id="pr-content-feature-context"
                  value={featureContextPath}
                  onChange={(event) => handleFeatureContextChange(event.target.value)}
                  disabled={isLoadingContextDocuments || contextDocuments.length === 0}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="pr-content-title" className="block text-xs font-medium text-text-secondary">
                    Title
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleCopy(title, 'Title')}
                    className="text-tiny px-2 py-0.5 rounded text-text-secondary hover:bg-surface-3 transition-colors"
                  >
                    Copy Title
                  </button>
                </div>
                <input
                  ref={titleRef}
                  id="pr-content-title"
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
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="pr-content-body" className="block text-xs font-medium text-text-secondary">
                    Description
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleCopy(body, 'Description')}
                    className="text-tiny px-2 py-0.5 rounded text-text-secondary hover:bg-surface-3 transition-colors"
                  >
                    Copy Description
                  </button>
                </div>
                <div className="mb-3">
                  <label htmlFor="pr-content-feature-context" className="block text-xs font-medium text-text-secondary mb-1.5">
                    Feature context
                  </label>
                  <select
                    id="pr-content-feature-context"
                    value={featureContextPath}
                    onChange={(event) => handleFeatureContextChange(event.target.value)}
                    disabled={isLoadingContext || isLoadingContextDocuments || contextDocuments.length === 0}
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
                  id="pr-content-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="PR description (markdown)"
                  rows={14}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border-subtle rounded-md text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors font-mono resize-y"
                />
                <p className={`mt-1 text-tiny ${aiGenerated ? 'text-text-muted' : 'text-amber-500'}`}>
                  {aiGenerated
                    ? 'Drafted from committed changes and plan context.'
                    : 'Using commit summary because drafting was unavailable.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <MotionButton
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary bg-surface-3/50 hover:bg-surface-3 rounded-md transition-colors"
          >
            Close
          </MotionButton>
          <MotionButton
            onClick={hasGeneratedContext ? () => void handleCopy(body, 'Description') : handleGenerate}
            disabled={
              isLoadingContext ||
              isLoadingContextDocuments ||
              (hasGeneratedContext && (!canCopy || !body.trim()))
            }
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingContext ? 'Generating...' : hasGeneratedContext ? 'Copy Description' : 'Generate'}
          </MotionButton>
        </div>
      </div>
    </Modal>
  );
}
