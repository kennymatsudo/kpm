import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores';
import type { SlashCommandInfo } from '../../../shared/types';

/** The whole draft is a slash token ('/', '/par', '/git:com') — no arguments yet. */
const TRIGGER_PATTERN = /^\/([A-Za-z0-9_:-]*)$/;

/** A complete known-command token followed by whitespace only — arguments not typed yet. */
const PENDING_ARGS_PATTERN = /^\/([A-Za-z0-9_:-]+)\s+$/;

function filterCommands(commands: SlashCommandInfo[], query: string): SlashCommandInfo[] {
  if (!query) return commands;
  const lower = query.toLowerCase();
  const prefix: SlashCommandInfo[] = [];
  const substring: SlashCommandInfo[] = [];
  for (const command of commands) {
    const name = command.name.toLowerCase();
    if (name.startsWith(lower)) prefix.push(command);
    else if (name.includes(lower)) substring.push(command);
  }
  return [...prefix, ...substring];
}

export interface SlashCommandTypeahead {
  /** Menu visible with at least one match */
  isOpen: boolean;
  /** Bare '/' typed but the user has no commands at all */
  showEmptyState: boolean;
  matches: SlashCommandInfo[];
  highlightIndex: number;
  setHighlightIndex: (index: number) => void;
  accept: (command: SlashCommandInfo) => void;
  /** Returns true when the key event was consumed by the menu */
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Chosen command awaiting arguments (drives the hint strip above the composer) */
  pendingHint: SlashCommandInfo | null;
}

/**
 * Typeahead state for user slash commands in the chat composer.
 *
 * The menu opens when the draft is a leading slash token, filters as the user
 * types, and closes the moment arguments begin (first space) or the trigger
 * breaks. Escape dismisses for the current token only; deleting back past the
 * slash re-arms it. The menu never blocks typing: with zero matches it hides
 * and Enter falls through to the normal send path.
 */
export function useSlashCommandTypeahead(
  message: string,
  setMessage: (text: string) => void,
  enabled: boolean,
): SlashCommandTypeahead {
  const { slashCommands, loadSlashCommands } = useChatStore(useShallow((state) => ({
    slashCommands: state.slashCommands,
    loadSlashCommands: state.loadSlashCommands,
  })));

  const [dismissed, setDismissed] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const triggerMatch = enabled ? TRIGGER_PATTERN.exec(message) : null;
  const query = triggerMatch ? triggerMatch[1] : null;
  const inTrigger = query !== null;

  const matches = inTrigger && !dismissed ? filterCommands(slashCommands, query) : [];
  const isOpen = matches.length > 0;
  const showEmptyState = inTrigger && !dismissed && query === '' && slashCommands.length === 0;

  // Re-arm after the trigger breaks, and rescan the commands dir on entry so
  // newly added files appear without restarting KPM.
  useEffect(() => {
    if (!inTrigger) {
      setDismissed(false);
    } else {
      void loadSlashCommands();
    }
  }, [inTrigger, loadSlashCommands]);

  // Keep the highlight pinned to the top result as the filter narrows
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  const accept = useCallback((command: SlashCommandInfo) => {
    setMessage(`/${command.name} `);
  }, [setMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!isOpen && !showEmptyState) return false;

    if (e.key === 'Escape') {
      // preventDefault also keeps the document-level Escape handler from
      // cancelling a streaming turn while the menu is up.
      e.preventDefault();
      setDismissed(true);
      return true;
    }
    if (!isOpen) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % matches.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + matches.length) % matches.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      accept(matches[Math.min(highlightIndex, matches.length - 1)]);
      return true;
    }
    return false;
  }, [isOpen, showEmptyState, matches, highlightIndex, accept]);

  const pendingMatch = enabled ? PENDING_ARGS_PATTERN.exec(message) : null;
  const pendingHint = pendingMatch
    ? slashCommands.find((command) => command.name === pendingMatch[1]) ?? null
    : null;

  return {
    isOpen,
    showEmptyState,
    matches,
    highlightIndex,
    setHighlightIndex,
    accept,
    handleKeyDown,
    pendingHint,
  };
}
