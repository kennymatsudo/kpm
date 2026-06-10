import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Command } from 'cmdk';
import { executeCustomPrompt } from '../../services/promptService';
import { LoadingSpinner } from '../ui/LoadingButton';
import { useShallow } from 'zustand/react/shallow';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: CustomPromptIcon;
  action: () => void;
  keywords: string[];
  promptId?: string;
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
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSettings = useSettingsUIStore((state) => state.setIsOpen);
  const setSettingsTab = useSettingsUIStore((state) => state.setActiveTab);

  const openCustomPromptSettings = useCallback(() => {
    onClose();
    setSettingsTab('prompts');
    openSettings(true);
  }, [onClose, setSettingsTab, openSettings]);

  useEffect(() => {
    if (isOpen) {
      void loadPrompts();
    }

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


  const groupedCommands = useMemo(() => ({
    project: commands.filter((command) => command.category === 'project'),
    prompts: commands.filter((command) => command.category === 'prompts'),
  }), [commands]);

  const executeCommand = useCallback(async (command: CommandItem) => {
    if (executingCommand) return;

    if (!command.promptId) {
      command.action();
      onClose();
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

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onClose();
    }

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setExecutingCommand(null);
      setCommandError(null);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  return (
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

          <Command.List className="max-h-[60vh] overflow-y-auto py-2">
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
