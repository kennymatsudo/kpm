import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores';
import type { SlashCommandInfo } from '../../../shared/types';

/** The token before the cursor is a slash token ('/', '/par', '/git:com') — no arguments yet. */
const TRIGGER_PATTERN = /^\/([A-Za-z0-9_:-]*)$/;

/** A complete known-command token followed by whitespace only — arguments not typed yet. */
const PENDING_ARGS_PATTERN = /^\/([A-Za-z0-9_:-]+)\s+$/;

/**
 * Start of the slash token ending at `cursorPosition`: the nearest `/` that
 * begins the message or follows whitespace. Null when there is no such token —
 * a `/` glued to preceding text (`src/main`, `10/2`) never starts one.
 */
function tokenStartFor(message: string, cursorPosition: number): number | null {
  const slashIndex = message.lastIndexOf('/', cursorPosition - 1);
  if (slashIndex === -1) return null;
  if (slashIndex > 0 && !/\s/.test(message[slashIndex - 1])) return null;
  return slashIndex;
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
 * The menu opens when the token before the cursor is a slash token — one
 * whose `/` starts the message or follows whitespace — filters as the user
 * types, and closes the moment arguments begin (first space) or the trigger
 * breaks. This works anywhere in the draft, including mid-sentence; slashes
 * glued to other text (file paths, fractions) never trigger. Escape dismisses
 * for the current token only; deleting back past the slash re-arms it. The
 * menu never blocks typing: with zero matches it hides and Enter falls
 * through to the normal send path.
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

  // Only the token being typed, up to the caret, counts. The caret must also
  // sit at a word boundary — clicking into the middle of a word ('/re|v')
  // stays quiet.
  const tokenStart = tokenStartFor(message, cursorPosition);
  const tokenPrefix = tokenStart === null ? '' : message.slice(tokenStart, cursorPosition);
  const atTokenBoundary = cursorPosition === message.length || /\s/.test(message[cursorPosition]);

  const triggerMatch = enabled && atTokenBoundary ? TRIGGER_PATTERN.exec(tokenPrefix) : null;
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
    if (tokenStart === null) return;
    const insertion = `/${command.name} `;
    // Consume one existing space after the caret so accepting mid-sentence
    // doesn't leave a double space before the rest of the text.
    const rest = message.slice(cursorPosition);
    const tail = rest.startsWith(' ') ? rest.slice(1) : rest;
    const nextMessage = message.slice(0, tokenStart) + insertion + tail;
    const caret = tokenStart + insertion.length;
    pendingCaretRef.current = caret;
    setMessage(nextMessage);
    setCursorPosition(caret);
  }, [message, tokenStart, cursorPosition, setMessage, setCursorPosition]);

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

  const pendingMatch = enabled && atTokenBoundary ? PENDING_ARGS_PATTERN.exec(tokenPrefix) : null;
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
