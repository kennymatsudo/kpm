import { useEffect, useRef } from 'react';
import type { SlashCommandInfo } from '../../../shared/types';

interface SlashCommandMenuProps {
  matches: SlashCommandInfo[];
  highlightIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (command: SlashCommandInfo) => void;
  /** Bare '/' typed but no commands exist — show where to add them instead of rows */
  showEmptyState: boolean;
}

/** Popover listing the user's slash commands, anchored above the chat composer. */
export function SlashCommandMenu({ matches, highlightIndex, onHighlight, onSelect, showEmptyState }: SlashCommandMenuProps) {
  const highlightedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  return (
    <div className="dropdown-menu absolute bottom-full left-0 right-0 mb-1.5 z-50">
      {showEmptyState ? (
        <div className="px-2 py-1.5 text-xs text-text-muted">
          No custom commands. Add markdown files to ~/.claude/commands.
        </div>
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto">
            {matches.map((command, index) => {
              const isHighlighted = index === highlightIndex;
              return (
                <button
                  key={command.name}
                  ref={isHighlighted ? highlightedRef : undefined}
                  type="button"
                  className="dropdown-item w-full text-left"
                  data-highlighted={isHighlighted || undefined}
                  // Keep focus in the textarea so selection doesn't blur the composer
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => onHighlight(index)}
                  onClick={() => onSelect(command)}
                >
                  <span className="font-mono text-xs text-text-primary whitespace-nowrap">/{command.name}</span>
                  {command.argumentHint && (
                    <span className="font-mono text-xxs text-text-muted whitespace-nowrap">{command.argumentHint}</span>
                  )}
                  <span className="ml-auto text-xs text-text-muted truncate">{command.description}</span>
                </button>
              );
            })}
          </div>
          <div className="px-2 pt-1 mt-0.5 border-t border-border-default text-xxs text-text-muted">
            ↑↓ navigate · ↵ select · esc dismiss
          </div>
        </>
      )}
    </div>
  );
}
