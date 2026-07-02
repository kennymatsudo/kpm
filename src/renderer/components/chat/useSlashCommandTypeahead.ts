import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores';
import type { SlashCommandInfo } from '../../../shared/types';

/** The current line (up to the cursor) is a slash token ('/', '/par', '/git:com') — no arguments yet. */
const TRIGGER_PATTERN = /^\/([A-Za-z0-9_:-]*)$/;

/** A complete known-command token followed by whitespace only — arguments not typed yet. */
const PENDING_ARGS_PATTERN = /^\/([A-Za-z0-9_:-]+)\s+$/;

/** Start of the line containing `cursorPosition` (0 if it's the first line). */
function lineStartFor(message: string, cursorPosition: number): number {
  return message.lastIndexOf('\n', cursorPosition - 1) + 1;
}

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
 * The menu opens when the current line (up to the cursor) is a leading slash
 * token, filters as the user types, and closes the moment arguments begin
 * (first space) or the trigger breaks. This works on any line of the draft,
 * not just the first — a command can follow other text or sit on its own
 * line. Escape dismisses for the current token only; deleting back past the
 * slash re-arms it. The menu never blocks typing: with zero matches it hides
 * and Enter falls through to the normal send path.
 */
export function useSlashCommandTypeahead(
  message: string,
  cursorPosition: number,
  setMessage: (text: string) => void,
  setCursorPosition: (position: number) => void,
  enabled: boolean,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
): SlashCommandTypeahead {
  const { slashCommands, loadSlashCommands } = useChatStore(useShallow((state) => ({
    slashCommands: state.slashCommands,
    loadSlashCommands: state.loadSlashCommands,
  })));

  const [dismissed, setDismissed] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const pendingCaretRef = useRef<number | null>(null);

  // Only the typed line, up to the caret, counts — trailing text on the same
  // line (from clicking mid-line) blocks the trigger, same as before.
  const lineStart = lineStartFor(message, cursorPosition);
  const linePrefix = message.slice(lineStart, cursorPosition);
  const atLineEnd = cursorPosition === message.length || message[cursorPosition] === '\n';

  const triggerMatch = enabled && atLineEnd ? TRIGGER_PATTERN.exec(linePrefix) : null;
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

  // Restore the caret after a programmatic insert — setMessage re-renders the
  // controlled textarea, which resets selection to the end by default.
  useEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret !== null) {
      pendingCaretRef.current = null;
      textareaRef.current?.setSelectionRange(caret, caret);
    }
  }, [message, textareaRef]);

  const accept = useCallback((command: SlashCommandInfo) => {
    const insertion = `/${command.name} `;
    const nextMessage = message.slice(0, lineStart) + insertion + message.slice(cursorPosition);
    const caret = lineStart + insertion.length;
    pendingCaretRef.current = caret;
    setMessage(nextMessage);
    setCursorPosition(caret);
  }, [message, lineStart, cursorPosition, setMessage, setCursorPosition]);

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

  const pendingMatch = enabled && atLineEnd ? PENDING_ARGS_PATTERN.exec(linePrefix) : null;
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
