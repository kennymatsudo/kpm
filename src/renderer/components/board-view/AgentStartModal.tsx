/**
 * AgentStartModal - Centered modal for configuring and starting an agent session.
 *
 * Shown when the user clicks the play button on a board card or drags
 * a card into the in_progress column.
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { listContextFiles } from '../../services/contextFileService';
import { listAllRepoBranches } from '../../services/repoService';

const EFFORT_OPTIONS: { value: AgentEffortLevel; label: string; title: string }[] = [
  { value: 'high', label: 'High', title: 'Deep thinking for complex tasks' },
  { value: 'max', label: 'Max', title: 'Maximum effort (Opus only)' },
];

interface ContextFileEntry {
  path: string;
  name: string;
}

interface AgentStartModalProps {
  item: PlanItem;
  onStart: (params: {
    planItemId: string;
    repoId: string;
    prompt: string;
    baseBranch?: string;
    contextPaths?: string[];
    effort?: AgentEffortLevel;
  }) => void;
  onClose: () => void;
  onMoveOnly?: () => void;
}

export const AgentStartModal = memo(function AgentStartModal({
  item,
  onStart,
  onClose,
  onMoveOnly,
}: AgentStartModalProps) {
  const repos = useResourceDomainStore((state) => state.repos);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [effort, setEffort] = useState<AgentEffortLevel>('high');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Context file attachment state
  const [contextFiles, setContextFiles] = useState<ContextFileEntry[]>([]);
  const [selectedContextPaths, setSelectedContextPaths] = useState<string[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);

  // Auto-select repo if only one
  useEffect(() => {
    if (repos.length === 1 && repos[0]) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos]);

  // Focus textarea on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Load branches when selected repo changes
  useEffect(() => {
    if (!selectedRepoId) return;
    const repo = repos.find((r) => r.id === selectedRepoId);
    if (!repo) return;

    setLoadingBranches(true);
    setSelectedBranch('');
    setBranches([]);

    listAllRepoBranches(repo.path)
      .then((branchList: string[]) => {
        setBranches(branchList);
        // Default to main/master if present, otherwise first branch
        const defaultBranch = branchList.find((b: string) => b === 'main' || b === 'master') ?? branchList[0] ?? '';
        setSelectedBranch(defaultBranch);
      })
        setBranches([]);
        setSelectedBranch('');
      })
      .finally(() => setLoadingBranches(false));

  // Load context files for the project
  useEffect(() => {
    const projectId = item.project_id;
    if (!projectId) return;

    listContextFiles(projectId)
      .then((result) => {
        if (result.success && result.files) {
          setContextFiles(
            result.files
              .filter((f) => !f.isClaudeMd)
              .map((f) => ({ path: f.path, name: f.name }))
          );
        }
      })
  }, [item.project_id]);

  const toggleContextFile = useCallback((filePath: string) => {
    setSelectedContextPaths((prev) =>
      prev.includes(filePath)
        ? prev.filter((p) => p !== filePath)
        : [...prev, filePath]
    );
  }, []);

  const handleStart = useCallback(() => {
    if (!selectedRepoId || isStarting) return;
    setIsStarting(true);
    onStart({
      planItemId: item.id,
      repoId: selectedRepoId,
      prompt: prompt.trim() || item.title,
      baseBranch: selectedBranch || undefined,
      contextPaths: selectedContextPaths.length > 0 ? selectedContextPaths : undefined,
      effort,
    });

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleStart();
    }
  }, [handleStart]);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const acceptanceCriteria = item.acceptance_criteria ?? [];
  const hasAcceptanceCriteria = acceptanceCriteria.length > 0;
  const hasIntent = Boolean(item.intent?.trim());
  const hasDescription = Boolean(item.description?.trim());

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="3xl"
    >
      <ModalHeader
        onClose={onClose}
        subtitle={item.title}
        className="sticky top-0 z-20 shrink-0 bg-surface-2/95 backdrop-blur-sm"
      >
        Start Agent
      </ModalHeader>

      <ModalBody className="flex-1 min-h-0 overflow-hidden p-0">
            <div className="space-y-4">
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">Spec</p>
                  <span className="rounded-full border border-border-subtle bg-surface-2 px-2 py-1 text-tiny text-text-secondary">
                    {hasAcceptanceCriteria ? `${acceptanceCriteria.length} criteria` : 'No criteria'}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-tiny font-semibold uppercase tracking-wide text-text-muted">Task</p>
                    <p className="text-sm font-medium text-text-primary">{item.title}</p>
                  </div>

                  {hasIntent && (
                    <div>
                      <p className="mb-1 text-tiny font-semibold uppercase tracking-wide text-text-muted">Intent</p>
                      <p className="text-sm leading-5 text-text-secondary whitespace-pre-wrap">{item.intent}</p>
                    </div>
                  )}

                  {hasAcceptanceCriteria && (
                    <div>
                      <p className="mb-2 text-tiny font-semibold uppercase tracking-wide text-text-muted">Acceptance Criteria</p>
                      <div className="space-y-2">
                        {acceptanceCriteria.map((criterion, index) => (
                          <div
                            key={`${criterion}-${index}`}
                            className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2"
                          >
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <span className="text-sm leading-5 text-text-secondary">{criterion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasDescription && (
                    <div>
                      <p className="mb-1 text-tiny font-semibold uppercase tracking-wide text-text-muted">
                        {hasAcceptanceCriteria ? 'Context' : 'Description'}
                      </p>
                      <p className="text-sm leading-5 text-text-secondary whitespace-pre-wrap">{item.description}</p>
                    </div>
                  )}

                  {!hasIntent && !hasAcceptanceCriteria && !hasDescription && (
                    <p className="text-sm text-text-muted">No spec yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

                {repos.length > 1 && (
                    <label className="mb-1 block text-tiny text-text-muted">Repository</label>
                  </div>
                )}

                  <label className="mb-1 block text-tiny text-text-muted">Base branch</label>
                  {loadingBranches ? (
                    <div className="w-full rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-2 text-sm text-text-muted">
                      Loading branches...
                    </div>
                  ) : (
                      disabled={branches.length === 0}
                    >
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-tiny text-text-muted">Effort</label>
                <div className="flex gap-1">
                  {EFFORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.title}
                      onClick={() => setEffort(opt.value)}
                      className={`
                        flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors
                        ${effort === opt.value
                          ? 'bg-accent text-white'
                          : 'border border-border-subtle bg-surface-1 text-text-secondary hover:bg-surface-2'
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {contextFiles.length > 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                  <button
                    type="button"
                    onClick={() => setShowContextPicker((prev) => !prev)}
                    className="flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
                  >
                    <svg className={`h-3 w-3 transition-transform ${showContextPicker ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6 3l5 5-5 5V3z" />
                    </svg>
                    Attach context files
                    {selectedContextPaths.length > 0 && (
                      <span className="text-accent">({selectedContextPaths.length})</span>
                    )}
                  </button>
                  <p className="mt-1 text-tiny text-text-muted">
                    Files added here will be sent as context.
                  </p>
                  {showContextPicker && (
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border-subtle bg-surface-0">
                      {contextFiles.map((file) => (
                        <label
                          key={file.path}
                          className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-surface-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContextPaths.includes(file.path)}
                            onChange={() => toggleContextFile(file.path)}
                            className="rounded border-border-subtle text-accent focus:ring-accent"
                          />
                          <span className="truncate text-text-primary">{file.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex min-h-[260px] flex-col">
                <div className="mb-2">
                  <label className="block text-tiny text-text-muted">Extra instructions</label>
                  <p className="mt-1 text-tiny leading-4 text-text-muted">
                    Optional. Constraints, file pointers, or implementation preferences.
                  </p>
                </div>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={10}
                  className="min-h-[260px] flex-1 resize-none rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Example: Reuse the existing auth reducer and keep the API shape unchanged."
                />
              </div>
            </div>
          </div>
        </div>
      </ModalBody>

          {selectedRepo ? `${selectedRepo.path.split('/').pop()}${selectedBranch ? ` · ${selectedBranch}` : ''}` : ''}
        </span>
        <button
          onClick={onClose}
        >
          Cancel
        </button>
        {onMoveOnly && (
          <button
            onClick={onMoveOnly}
          >
            Just move
          </button>
        )}
        <button
          onClick={handleStart}
          disabled={!selectedRepoId || isStarting || loadingBranches}
          className="
            px-4 py-1.5 rounded-lg text-sm font-medium
            bg-accent text-white hover:bg-accent/90
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isStarting ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Starting...
            </>
          ) : (
            'Start with Claude'
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
});
