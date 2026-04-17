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
}

export const AgentStartModal = memo(function AgentStartModal({
  item,
  onStart,
  onClose,
}: AgentStartModalProps) {
  const repos = useResourceDomainStore((state) => state.repos);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id ?? '');
  const [isStarting, setIsStarting] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loadingBranches, setLoadingBranches] = useState(false);
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

  return (
        Start Agent
      </ModalHeader>

            </div>
          </div>

                )}
                    >
                  ))}
                </div>
              )}

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
