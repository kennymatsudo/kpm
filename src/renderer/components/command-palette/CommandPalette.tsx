import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Command } from 'cmdk';
import {
  useProjectDomainStore,
  useCustomPromptStore,
  useContextRegenerationStore,
  useCustomPromptTaskStore,
  useSettingsUIStore,
  useResourceDomainStore,
  useProjectUiDomainStore,
  useChatStore,
  useScheduledLoopStore,
} from '../../stores';
import { emit } from '../../stores/storeEvents';
import { executeCustomPrompt } from '../../services/promptService';
import { listProjectDirectory } from '../../services/projectFileService';
import { useChat } from '../../hooks/useChat';
import { getBaseName } from '../../utils/path';
import { LoadingSpinner } from '../ui/LoadingButton';
import type { CustomPrompt, CustomPromptIcon, FileNode, FocusedResource, ScheduledLoop } from '../../../shared/types';
import { useShallow } from 'zustand/react/shallow';
import { LoopModal } from './LoopModal';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: CustomPromptIcon;
  category: 'prompts' | 'project' | 'navigation' | 'loops';
  action: () => void;
  keywords: string[];
  promptId?: string;
}

interface DocumentTarget {
  name: string;
  path: string;
}

/** Markdown files under the project folder — same definition the global search index uses. */
function flattenMarkdownFiles(nodes: FileNode[], acc: DocumentTarget[] = []): DocumentTarget[] {
  for (const node of nodes) {
    if (node.isDirectory) {
      if (node.children) flattenMarkdownFiles(node.children, acc);
    } else if (/\.mdx?$/i.test(node.name)) {
      acc.push({ name: node.name, path: node.path });
    }
  }
  return acc;
}

function describeLoop(loop: ScheduledLoop): string {
  const mode = loop.output_mode.charAt(0).toUpperCase() + loop.output_mode.slice(1);
  const cadence = loop.enabled ? `every ${loop.interval_minutes}m` : 'paused';
  return `${cadence} · ${mode}${ran}`;
}

function CommandIcon({ icon, className }: { icon: CustomPromptIcon; className?: string }) {
  switch (icon) {
    case 'chart':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'check':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'document':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      );
  }
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [executingCommand, setExecutingCommand] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const currentProjectId = useProjectDomainStore((state) => state.currentProjectId);
  const { prompts, loadPrompts, isLoading: promptsLoading } = useCustomPromptStore(
    useShallow((state) => ({
      prompts: state.prompts,
      loadPrompts: state.loadPrompts,
      isLoading: state.isLoading,
    }))
  );
  const { loops, loadLoops, openCreateLoop, openEditLoop } = useScheduledLoopStore(
    useShallow((state) => ({
      loops: state.loops,
      loadLoops: state.loadLoops,
      openCreateLoop: state.openCreate,
      openEditLoop: state.openEdit,
    }))
  );
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSettings = useSettingsUIStore((state) => state.setIsOpen);
  const setSettingsTab = useSettingsUIStore((state) => state.setActiveTab);
  const repos = useResourceDomainStore((state) => state.repos);
  const { send } = useChat(currentProjectId, 'workspace');

  // Target-picker page state: set when a targeted chat prompt was selected and
  // is waiting for the user to pick which document/repo it runs on.
  const [pickerPrompt, setPickerPrompt] = useState<CustomPrompt | null>(null);
  const [docTargets, setDocTargets] = useState<DocumentTarget[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);

  const closePicker = useCallback(() => {
    setPickerPrompt(null);
    setSearch('');
  }, []);

  // Load the project's markdown documents when the document picker opens.
  useEffect(() => {
    if (pickerPrompt?.target_type !== 'document' || !currentProjectId) return;
    let cancelled = false;
    setDocsLoading(true);
    listProjectDirectory(currentProjectId, undefined, { recursive: true })
      .then((nodes) => {
        if (!cancelled) setDocTargets(flattenMarkdownFiles(nodes));
      })
      .catch((error: unknown) => {
        console.error('[CommandPalette] Failed to list documents:', error);
        if (!cancelled) setDocTargets([]);
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerPrompt, currentProjectId]);

  const sendPromptToChat = useCallback((prompt: CustomPrompt, resource?: FocusedResource) => {
    const chatStore = useChatStore.getState();
    const sessionId = chatStore.getChatSessionId();
    chatStore.getOrCreateSession(sessionId);
    if (resource) {
      useProjectUiDomainStore.getState().addFocusedResource(resource);
    }
    emit({ type: 'navigate-to-view', payload: { view: 'workspace', showChat: true } });
    onClose();
    void send(prompt.prompt_content, undefined, undefined, sessionId);
  }, [onClose, send]);

  const handleTargetSelect = useCallback((resource: FocusedResource) => {
    if (!pickerPrompt) return;
    sendPromptToChat(pickerPrompt, resource);
  }, [pickerPrompt, sendPromptToChat]);

  const openCustomPromptSettings = useCallback(() => {
    onClose();
    setSettingsTab('prompts');
    openSettings(true);
  }, [onClose, setSettingsTab, openSettings]);

  useEffect(() => {
    if (isOpen) {
      void loadPrompts();
      if (currentProjectId) void loadLoops(currentProjectId);
    }
  }, [isOpen, loadPrompts, loadLoops, currentProjectId]);

  const commands = useMemo<CommandItem[]>(() => {
    if (!currentProjectId) return [];

    const builtIn: CommandItem[] = [
      {
        id: 'regenerate-context',
        label: 'Regenerate Project Context',
        description: 'Regenerate AGENTS.md / CLAUDE.md from connected repos',
        icon: 'sparkles',
        category: 'project',
        keywords: ['agents', 'claude', 'context', 'regenerate', 'refresh', 'md'],
        action: () => {
          useContextRegenerationStore.getState().open();
        },
      },
    ];

    const promptCommands = prompts.map((prompt) => ({
      id: `prompt-${prompt.id}`,
      label: prompt.name,
      description: prompt.description || 'Execute custom prompt',
      icon: prompt.icon,
      category: 'prompts' as const,
      keywords: prompt.keywords ? prompt.keywords.split(',').map((k) => k.trim().toLowerCase()) : [],
      promptId: prompt.id,
      action: () => {
        // Handled by executeCommand.
      },
    }));

    const loopCommands: CommandItem[] = [
      {
        id: 'new-loop',
        label: 'New loop…',
        description: 'Schedule a recurring prompt — watch Slack/PRs/tickets or keep docs current',
        icon: 'sparkles',
        category: 'loops',
        keywords: ['loop', 'schedule', 'recurring', 'watch', 'cron', 'new', 'automation'],
        action: () => {
          openCreateLoop();
        },
      },
      ...loops.map((loop): CommandItem => ({
        id: `loop-${loop.id}`,
        label: loop.name,
        description: describeLoop(loop),
        icon: 'check',
        category: 'loops',
        keywords: ['loop', 'schedule', loop.output_mode],
        action: () => {
          openEditLoop(loop);
        },
      })),
    ];

    return [...builtIn, ...loopCommands, ...promptCommands];
  }, [currentProjectId, prompts, loops, openCreateLoop, openEditLoop]);

  const groupedCommands = useMemo(() => ({
    project: commands.filter((command) => command.category === 'project'),
    loops: commands.filter((command) => command.category === 'loops'),
    prompts: commands.filter((command) => command.category === 'prompts'),
  }), [commands]);

  const executeCommand = useCallback(async (command: CommandItem) => {
    if (executingCommand) return;

    if (!command.promptId) {
      command.action();
      onClose();
      return;
    }

    const prompt = prompts.find((p) => p.id === command.promptId);
    if (prompt?.run_mode === 'chat') {
      if (prompt.target_type === 'none') {
        sendPromptToChat(prompt);
      } else {
        setPickerPrompt(prompt);
        setSearch('');
      }
      return;
    }

    setExecutingCommand(command.id);
    setCommandError(null);

    try {
      const result = await executeCustomPrompt(currentProjectId!, command.promptId);

      if (result.success && result.taskId) {
        useCustomPromptTaskStore.getState().startTask({
          taskId: result.taskId,
          promptName: command.label,
          projectId: currentProjectId!,
          startedAt: Date.now(),
        });
        closeTimeoutRef.current = setTimeout(() => {
          onClose();
        }, 200);
      } else {
        setCommandError(result.error || 'Failed to start generation');
        setExecutingCommand(null);
      }
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : 'An error occurred');
      setExecutingCommand(null);
    }
  }, [executingCommand, currentProjectId, onClose, prompts, sendPromptToChat]);

  const filterCommand = useCallback((value: string, searchValue: string, keywords?: string[]) => {
    const haystack = `${value} ${(keywords ?? []).join(' ')}`.toLowerCase();
    const tokens = searchValue
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return 1;
    return tokens.every((token) => haystack.includes(token)) ? 1 : 0;
  }, []);

  // Escape steps back to the command list when the target picker is open,
  // and only closes the palette from the root page.
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      if (pickerPrompt) {
        closePicker();
        return;
      }
      onClose();
    }
  }, [onClose, pickerPrompt, closePicker]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setExecutingCommand(null);
      setCommandError(null);
      setPickerPrompt(null);
      setDocTargets(null);
      setDocsLoading(false);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  return (
    <>
    <Command.Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      label="Command palette"
      filter={filterCommand}
      loop
      overlayClassName="fixed inset-0 z-[400] [background:var(--overlay-color)] backdrop-blur-[8px]"
      contentClassName="fixed left-1/2 top-[15vh] z-[401] w-full max-w-2xl -translate-x-1/2 px-4 outline-none"
    >
      <div
        className="bg-surface-elevated rounded-2xl overflow-hidden"
        style={{
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <Command
          className="overflow-hidden"
          shouldFilter={!promptsLoading && Boolean(currentProjectId)}
          vimBindings={false}
        >
          <div className="relative border-b border-border-default">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (pickerPrompt && e.key === 'Backspace' && search === '') {
                  e.preventDefault();
                  closePicker();
                }
              }}
              placeholder={
                pickerPrompt
                  ? pickerPrompt.target_type === 'document'
                    ? 'Search documents...'
                    : 'Search repos...'
                  : 'Type a command or search...'
              }
              className="w-full pl-14 pr-20 py-4.5 bg-transparent text-text-primary text-base placeholder:text-text-muted focus:outline-none font-medium tracking-tight"
            />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <kbd className="px-2 py-0.5 bg-surface-3 text-text-muted text-xs font-medium rounded-md border border-border-subtle">
                ESC
              </kbd>
            </div>
          </div>

          {commandError && (
            <div className="collapse-reveal mx-2 mt-2 px-4 py-3 bg-danger-muted rounded-xl border border-danger/20">
              <p className="text-sm text-danger">{commandError}</p>
            </div>
          )}

          {pickerPrompt && (
            <div className="flex items-center gap-2 px-5 py-2 border-b border-border-default bg-surface-2/50">
              <CommandIcon icon={pickerPrompt.icon} className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-xs font-medium text-text-secondary truncate">
                {pickerPrompt.name}
              </span>
              <span className="text-xs text-text-muted shrink-0">
                — pick {pickerPrompt.target_type === 'document' ? 'a document' : 'a repo'}
              </span>
            </div>
          )}

          <Command.List className="max-h-[60vh] overflow-y-auto py-2">
            {pickerPrompt ? (
              docsLoading ? (
                <Command.Loading className="px-6 py-12 text-center">
                  <LoadingSpinner className="w-6 h-6 mx-auto mb-3" color="accent" />
                  <p className="text-text-muted text-sm font-medium">Loading documents...</p>
                </Command.Loading>
              ) : (
                <>
                  <Command.Empty className="px-6 py-12 text-center">
                    <p className="text-text-muted text-sm font-medium">
                      {pickerPrompt.target_type === 'document' ? 'No documents found' : 'No connected repos'}
                    </p>
                  </Command.Empty>
                  <Command.Group
                    heading={pickerPrompt.target_type === 'document' ? 'Documents' : 'Repos'}
                    className="px-2 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted"
                  >
                    {pickerPrompt.target_type === 'document'
                      ? (docTargets ?? []).map((doc) => (
                          <TargetItem
                            key={doc.path}
                            value={`doc-${doc.path}`}
                            label={doc.name}
                            detail={doc.path}
                            icon="document"
                            onSelect={() => handleTargetSelect({ type: 'project_file', path: doc.path, isDirectory: false })}
                          />
                        ))
                      : repos.map((repo) => (
                          <TargetItem
                            key={repo.id}
                            value={`repo-${repo.id}`}
                            label={getBaseName(repo.path, repo.path)}
                            detail={repo.path}
                            icon="repo"
                            onSelect={() => handleTargetSelect({ type: 'repo', id: repo.id, path: repo.path })}
                          />
                        ))}
                  </Command.Group>
                </>
              )
            ) : promptsLoading ? (
              <Command.Loading className="px-6 py-12 text-center">
                <LoadingSpinner className="w-6 h-6 mx-auto mb-3" color="accent" />
                <p className="text-text-muted text-sm font-medium">Loading prompts...</p>
              </Command.Loading>
            ) : !currentProjectId ? (
              <div className="px-6 py-12 text-center">
                <svg className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
                <p className="text-text-muted text-sm font-medium">No project open</p>
                <p className="text-text-tertiary text-xs mt-1">Open a project to use commands</p>
              </div>
            ) : (
              <>
                <Command.Empty className="px-6 py-12 text-center">
                  <svg className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-text-muted text-sm font-medium">No commands found</p>
                  <p className="text-text-tertiary text-xs mt-1">
                    {prompts.length === 0 ? 'Create a custom prompt to run it from here' : 'Try different keywords'}
                  </p>
                  {prompts.length === 0 && (
                    <button
                      type="button"
                      onClick={openCustomPromptSettings}
                      className="btn btn-secondary mt-3"
                    >
                      Open Custom Prompts settings
                    </button>
                  )}
                </Command.Empty>

                {groupedCommands.project.length > 0 && (
                  <Command.Group
                    heading="Project"
                    className="px-2 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted"
                  >
                    {groupedCommands.project.map((command) => renderCommandItem(command, executingCommand, executeCommand))}
                  </Command.Group>
                )}

                {groupedCommands.loops.length > 0 && (
                  <Command.Group
                    heading="Loops"
                    className="px-2 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted"
                  >
                    {groupedCommands.loops.map((command) => renderCommandItem(command, executingCommand, executeCommand))}
                  </Command.Group>
                )}

                {(groupedCommands.project.length > 0 || groupedCommands.loops.length > 0) && groupedCommands.prompts.length > 0 && (
                  <Command.Separator className="mx-4 my-2 h-px bg-border-default" />
                )}

                {groupedCommands.prompts.length > 0 && (
                  <Command.Group
                    heading="Prompts"
                    className="px-2 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted"
                  >
                    {groupedCommands.prompts.map((command) => renderCommandItem(command, executingCommand, executeCommand))}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>
        </Command>

        <div className="border-t border-border-default px-4 py-3 bg-surface-2">
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-surface-3 rounded border border-border-subtle">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-surface-3 rounded border border-border-subtle">↓</kbd>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-surface-3 rounded border border-border-subtle">↵</kbd>
                <span>Execute</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">⌘K</span>
              <span>to open</span>
            </div>
          </div>
        </div>
      </div>
    </Command.Dialog>
    <LoopModal />
    </>
  );
}

interface TargetItemProps {
  value: string;
  label: string;
  detail: string;
  icon: 'document' | 'repo';
  onSelect: () => void;
}

function TargetItem({ value, label, detail, icon, onSelect }: TargetItemProps) {
  return (
    <Command.Item
      value={value}
      keywords={[label, detail]}
      onSelect={onSelect}
      className="group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-150 cursor-pointer aria-selected:bg-accent-muted aria-selected:shadow-sm"
    >
      <div className="text-text-secondary group-aria-selected:text-accent shrink-0">
        {icon === 'document' ? (
          <CommandIcon icon="document" className="w-4 h-4" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-sm font-medium text-text-primary group-aria-selected:text-accent truncate">
          {label}
        </span>
        <span className="text-xs text-text-tertiary truncate">{detail}</span>
      </div>
      <div className="opacity-0 transition-opacity group-aria-selected:opacity-100 shrink-0">
        <kbd className="px-2 py-1 bg-surface-4 text-text-muted text-xs font-medium rounded border border-border-subtle">
          ↵
        </kbd>
      </div>
    </Command.Item>
  );
}

function renderCommandItem(
  command: CommandItem,
  executingCommand: string | null,
  executeCommand: (command: CommandItem) => Promise<void>,
) {
  const isExecuting = executingCommand === command.id;
  const isDisabled = executingCommand !== null && !isExecuting;

  return (
    <Command.Item
      key={command.id}
      value={command.id}
      keywords={[command.label, command.description, ...command.keywords]}
      onSelect={() => {
        if (!isDisabled) {
          void executeCommand(command);
        }
      }}
      disabled={isDisabled}
      className="group w-full flex items-start gap-4 px-4 py-3.5 rounded-xl transition-all duration-150 cursor-pointer data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed aria-selected:bg-accent-muted aria-selected:shadow-sm"
    >
      <div className="mt-0.5 transition-transform duration-200 text-text-secondary group-aria-selected:scale-110 group-aria-selected:text-accent">
        {isExecuting ? (
          <LoadingSpinner className="w-5 h-5" color="accent" />
        ) : (
          <CommandIcon icon={command.icon} className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-semibold tracking-tight text-text-primary transition-colors group-aria-selected:text-accent">
          {isExecuting ? 'Starting...' : command.label}
        </div>
        <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">
          {isExecuting ? 'Generation will continue in background' : command.description}
        </div>
      </div>

      {!executingCommand && (
        <div className="mt-1 opacity-0 transition-opacity group-aria-selected:opacity-100">
          <kbd className="px-2 py-1 bg-surface-4 text-text-muted text-xs font-medium rounded border border-border-subtle">
            ↵
          </kbd>
        </div>
      )}
    </Command.Item>
  );
}
