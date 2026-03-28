import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { executeCustomPrompt } from '../../services/promptService';
import { LoadingSpinner } from '../ui/LoadingButton';
import { useShallow } from 'zustand/react/shallow';

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

  useEffect(() => {
    if (isOpen) {
      void loadPrompts();
    }

    if (!currentProjectId) return [];

      id: `prompt-${prompt.id}`,
      label: prompt.name,
      description: prompt.description || 'Execute custom prompt',
      icon: prompt.icon,
      category: 'prompts' as const,
      keywords: prompt.keywords ? prompt.keywords.split(',').map((k) => k.trim().toLowerCase()) : [],
      promptId: prompt.id,
      action: () => {
      },
    }));


    if (!command.promptId) {
      command.action();
      return;
    }

    setExecutingCommand(command.id);
    setCommandError(null);

    try {
      const result = await executeCustomPrompt(currentProjectId!, command.promptId);

      if (result.success && result.taskId) {
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


        )}
      </div>
  );
}
